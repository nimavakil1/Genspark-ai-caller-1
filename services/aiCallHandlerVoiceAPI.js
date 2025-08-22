const EventEmitter = require('events');

class AICallHandler extends EventEmitter {
    constructor(telnyxService) {
        super();
        this.telnyxService = telnyxService;
        this.conversationState = new Map(); // Track conversation state for each call
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        // Handle different call events from Telnyx Voice API
        this.telnyxService.on('callInitiated', (call) => {
            this.handleCallInitiated(call);
        });
        
        this.telnyxService.on('callAnswered', (call) => {
            this.handleCallAnswered(call);
        });
        
        this.telnyxService.on('callHangup', (call) => {
            this.handleCallEnd(call);
        });
        
        this.telnyxService.on('speechEnded', (payload) => {
            this.handleSpeechEnded(payload);
        });
        
        this.telnyxService.on('gatherEnded', (payload) => {
            this.handleGatherEnded(payload);
        });
        
        this.telnyxService.on('recordingSaved', (payload) => {
            this.handleRecordingSaved(payload);
        });
    }
    
    handleCallInitiated(call) {
        console.log('🤖 AI handling call initiation:', call.call_control_id);
        
        // Initialize conversation state
        this.conversationState.set(call.call_control_id, {
            step: 'greeting',
            customerInfo: {},
            startTime: new Date()
        });
        
        // Log call to database
        this.logCallToDatabase(call, 'inbound');
    }
    
    async handleCallAnswered(call) {
        console.log('🤖 AI handling answered call:', call.call_control_id);
        
        // Start AI conversation with greeting
        await this.startAIConversation(call.call_control_id);
    }
    
    async handleSpeechEnded(payload) {
        console.log('🗣️  AI speech ended for call:', payload.call_control_id);
        
        const state = this.conversationState.get(payload.call_control_id);
        if (!state) return;
        
        // Continue conversation based on current step
        await this.continueConversation(payload.call_control_id, state);
    }
    
    async handleGatherEnded(payload) {
        console.log('🎤 AI processing user input:', payload.digits || 'no input');
        
        const callControlId = payload.call_control_id;
        const digits = payload.digits;
        const state = this.conversationState.get(callControlId);
        
        if (!state) return;
        
        // Process user input and continue conversation
        await this.processUserInput(callControlId, digits, state);
    }
    
    async startAIConversation(callControlId) {
        console.log('🤖 Starting AI conversation for call:', callControlId);
        
        const greeting = `Hello! Thank you for calling our receipt roll supply service. 
                         I'm an AI assistant here to help you with your thermal paper and receipt roll needs. 
                         Are you calling to place an order, check existing inventory, or do you have questions about our products? 
                         Please press 1 for new orders, 2 for existing customer service, or 3 to speak with a human representative.`;
        
        try {
            // Start recording
            await this.telnyxService.startRecording(callControlId);
            
            // Speak greeting and gather input
            await this.telnyxService.gatherInput(callControlId, greeting, {
                minimumDigits: 1,
                maximumDigits: 1,
                timeoutMs: 10000,
                validDigits: '123'
            });
            
        } catch (error) {
            console.error('❌ Error starting AI conversation:', error);
        }
    }
    
    async processUserInput(callControlId, input, state) {
        console.log(`🧠 Processing input "${input}" for step: ${state.step}`);
        
        try {
            switch (state.step) {
                case 'greeting':
                    await this.handleMainMenuSelection(callControlId, input, state);
                    break;
                    
                case 'new_order':
                    await this.handleNewOrderFlow(callControlId, input, state);
                    break;
                    
                case 'existing_customer':
                    await this.handleExistingCustomerFlow(callControlId, input, state);
                    break;
                    
                case 'product_selection':
                    await this.handleProductSelection(callControlId, input, state);
                    break;
                    
                case 'quantity_input':
                    await this.handleQuantityInput(callControlId, input, state);
                    break;
                    
                default:
                    await this.handleUnknownStep(callControlId, state);
            }
            
        } catch (error) {
            console.error('❌ Error processing user input:', error);
            await this.handleError(callControlId);
        }
    }
    
    async handleMainMenuSelection(callControlId, input, state) {
        switch (input) {
            case '1': // New orders
                state.step = 'new_order';
                await this.telnyxService.gatherInput(
                    callControlId,
                    `Great! I'll help you place a new order. We specialize in thermal receipt rolls for Belgian businesses. 
                     What type of receipt rolls do you need? 
                     Press 1 for standard 80mm thermal rolls, 2 for 57mm thermal rolls, 
                     3 for 112mm wide format rolls, or 4 to hear more options.`,
                    { validDigits: '1234', timeoutMs: 15000 }
                );
                break;
                
            case '2': // Existing customer
                state.step = 'existing_customer';
                await this.telnyxService.gatherInput(
                    callControlId,
                    `Thank you for being a valued customer! 
                     Please enter your 4-digit customer ID followed by the hash key, 
                     or press 0 if you don't have your customer ID available.`,
                    { minimumDigits: 1, maximumDigits: 5, terminatingDigit: '#' }
                );
                break;
                
            case '3': // Human representative
                await this.transferToHuman(callControlId, state);
                break;
                
            default:
                await this.telnyxService.gatherInput(
                    callControlId,
                    `I didn't catch that. Please press 1 for new orders, 2 for existing customer service, or 3 for a human representative.`,
                    { validDigits: '123', timeoutMs: 10000 }
                );
        }
        
        this.conversationState.set(callControlId, state);
    }
    
    async handleNewOrderFlow(callControlId, input, state) {
        const products = {
            '1': { name: '80mm Thermal Rolls', price: '€0.45 per roll', code: 'TR80' },
            '2': { name: '57mm Thermal Rolls', price: '€0.35 per roll', code: 'TR57' },
            '3': { name: '112mm Wide Format Rolls', price: '€0.65 per roll', code: 'TR112' },
            '4': 'more_options'
        };
        
        if (input === '4') {
            await this.telnyxService.gatherInput(
                callControlId,
                `Additional options: Press 5 for custom width rolls, 6 for colored thermal paper, 
                 7 for premium long-life thermal rolls, or 8 to return to main product menu.`,
                { validDigits: '5678', timeoutMs: 15000 }
            );
            return;
        }
        
        const product = products[input];
        if (product && product.name) {
            state.selectedProduct = product;
            state.step = 'quantity_input';
            
            await this.telnyxService.gatherInput(
                callControlId,
                `Excellent choice! You've selected ${product.name} at ${product.price}. 
                 How many boxes would you like to order? Each box contains 50 rolls. 
                 Please enter the number of boxes followed by the hash key.`,
                { minimumDigits: 1, maximumDigits: 3, terminatingDigit: '#' }
            );
        } else {
            await this.telnyxService.gatherInput(
                callControlId,
                `Please select a valid option: 1 for 80mm rolls, 2 for 57mm rolls, 3 for 112mm rolls, or 4 for more options.`,
                { validDigits: '1234', timeoutMs: 10000 }
            );
        }
        
        this.conversationState.set(callControlId, state);
    }
    
    async handleQuantityInput(callControlId, input, state) {
        const quantity = parseInt(input);
        
        if (isNaN(quantity) || quantity < 1 || quantity > 100) {
            await this.telnyxService.gatherInput(
                callControlId,
                `Please enter a valid quantity between 1 and 100 boxes, followed by the hash key.`,
                { minimumDigits: 1, maximumDigits: 3, terminatingDigit: '#' }
            );
            return;
        }
        
        state.orderQuantity = quantity;
        const product = state.selectedProduct;
        const totalRolls = quantity * 50;
        const pricePerRoll = parseFloat(product.price.match(/€([\d.]+)/)[1]);
        const totalPrice = (totalRolls * pricePerRoll).toFixed(2);
        
        // Final confirmation
        await this.telnyxService.speakText(
            callControlId,
            `Perfect! Let me confirm your order: 
             ${quantity} boxes of ${product.name}, 
             that's ${totalRolls} individual rolls 
             for a total of €${totalPrice} including VAT. 
             
             To complete this order, I'll need your business details. 
             A customer service representative will call you back within 30 minutes 
             to finalize the order and arrange delivery. 
             
             Thank you for choosing our receipt roll service! 
             Your order reference is ${this.generateOrderReference()}. 
             Have a great day!`
        );
        
        // Log the order details
        await this.logOrderToDatabase(callControlId, state);
        
        // End the call after a brief pause
        setTimeout(async () => {
            await this.telnyxService.hangupCall(callControlId);
        }, 3000);
    }
    
    async transferToHuman(callControlId, state) {
        await this.telnyxService.speakText(
            callControlId,
            `I'll transfer you to one of our customer service representatives. 
             Please hold while I connect you. 
             If no one is available, we'll call you back within one hour during business hours.`
        );
        
        // In production, you would implement actual call transfer here
        // For now, we'll just log the transfer request
        console.log('📞 Transfer to human requested for call:', callControlId);
        
        setTimeout(async () => {
            await this.telnyxService.hangupCall(callControlId);
        }, 2000);
    }
    
    async continueConversation(callControlId, state) {
        // This handles cases where speech ends and we need to continue
        // Mostly used for speech-only interactions
        console.log('🔄 Continuing conversation for call:', callControlId);
    }
    
    async handleError(callControlId) {
        await this.telnyxService.speakText(
            callControlId,
            `I apologize, but I'm experiencing technical difficulties. 
             A customer service representative will call you back shortly. 
             Thank you for your patience.`
        );
        
        setTimeout(async () => {
            await this.telnyxService.hangupCall(callControlId);
        }, 2000);
    }
    
    handleCallEnd(call) {
        console.log('📞 AI handling call end:', call.call_control_id);
        
        // Clean up conversation state
        this.conversationState.delete(call.call_control_id);
        
        // Update call log with end time
        this.updateCallLog(call);
    }
    
    handleRecordingSaved(payload) {
        console.log('📹 Recording saved for analysis:', payload.recording_url);
        
        // In production, you could:
        // 1. Download the recording
        // 2. Process with speech-to-text
        // 3. Analyze conversation quality
        // 4. Store transcript in database
    }
    
    generateOrderReference() {
        return 'ORD' + Date.now().toString().slice(-8);
    }
    
    async logCallToDatabase(call, direction) {
        try {
            console.log(`📊 Logging ${direction} call to database:`, {
                callId: call.call_control_id,
                from: call.from,
                to: call.to,
                direction: direction,
                timestamp: new Date()
            });
            
            // TODO: Integrate with existing PostgreSQL database
            // INSERT INTO call_logs (call_id, customer_phone, direction, start_time, status)
            // VALUES (call.call_control_id, call.from, direction, NOW(), 'active')
            
        } catch (error) {
            console.error('❌ Error logging call to database:', error);
        }
    }
    
    async logOrderToDatabase(callControlId, state) {
        try {
            console.log('📊 Logging order to database:', {
                callId: callControlId,
                product: state.selectedProduct,
                quantity: state.orderQuantity,
                orderRef: this.generateOrderReference()
            });
            
            // TODO: Integrate with existing PostgreSQL database
            // Save order details to orders table
            
        } catch (error) {
            console.error('❌ Error logging order to database:', error);
        }
    }
    
    async updateCallLog(call) {
        try {
            console.log('📊 Updating call log with end time:', call.call_control_id);
            
            // TODO: Update database with call end time, duration, summary
            
        } catch (error) {
            console.error('❌ Error updating call log:', error);
        }
    }
}

module.exports = AICallHandler;