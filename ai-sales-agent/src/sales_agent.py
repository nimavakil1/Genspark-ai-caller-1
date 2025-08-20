"""
AI Sales Agent for Receipt Roll Outbound Calling
Uses LiveKit + OpenAI to make sales calls and sell receipt rolls
"""

import asyncio
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import json

import openai as openai_client
# LiveKit imports will be added when ready for real voice calling

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class Customer:
    """Customer data structure"""
    name: str
    phone: str
    business_name: str
    last_contact: Optional[str] = None
    status: str = "new"  # new, contacted, interested, not_interested, sold
    notes: str = ""

@dataclass
class Product:
    """Receipt roll product information"""
    name: str
    size: str  # e.g., "80mm x 80mm"
    price: float
    description: str
    thermal: bool = True

class ReceiptRollsSalesAgent:
    """AI Agent for selling receipt rolls via outbound calls"""
    
    def __init__(self, openai_api_key: str, livekit_url: str, livekit_token: str):
        self.openai_api_key = openai_api_key
        self.livekit_url = livekit_url
        self.livekit_token = livekit_token
        
        # Initialize OpenAI client
        self.openai_client = openai_client.OpenAI(api_key=openai_api_key)
        
        # Product catalog
        self.products = [
            Product("Premium Thermal Receipt Rolls", "80mm x 80mm", 2.50, 
                   "High-quality thermal paper, 80 meters long, fits most POS systems", True),
            Product("Standard Receipt Rolls", "57mm x 40mm", 1.75, 
                   "Standard thermal paper for small POS systems and card readers", True),
            Product("Large Format Receipt Rolls", "80mm x 120mm", 3.25, 
                   "Extended length for high-volume businesses", True),
        ]
        
        # Sales script and conversation flow
        self.sales_script = {
            "greeting": "Hello, is this {name}? Hi {name}, this is Sarah from Premium Paper Solutions. I hope I'm catching you at a good time. I'm calling because we specialize in providing high-quality receipt rolls for businesses like {business_name}, and I wanted to see if you might be interested in learning about how we can help reduce your paper costs while improving quality.",
            
            "value_proposition": "We supply premium thermal receipt rolls that last 40% longer than standard rolls, which means fewer roll changes for your staff and better customer receipts. Many of our clients save $50-200 per month just by switching to our products.",
            
            "pain_points": [
                "Are you currently happy with your receipt paper supplier?",
                "Do you ever have issues with faded receipts or frequent roll changes?",
                "How much do you typically spend on receipt rolls per month?"
            ],
            
            "objection_handling": {
                "price": "I understand price is important. Our rolls actually cost less per transaction because they last longer. Would you like me to calculate your potential savings?",
                "current_supplier": "That's great that you have a supplier. Many of our best customers came from other suppliers once they saw the quality difference. Would you be open to trying a sample pack?",
                "no_time": "I completely understand you're busy. This will just take 2 minutes. Can I quickly tell you about our free sample offer?"
            },
            
            "closing": "Based on what you've told me, I think our {product_name} would be perfect for {business_name}. I can send you a sample pack of 10 rolls to try completely free - no obligation. If you like them, we can set up regular delivery. What's the best address to send the samples?"
        }
    
    def get_sales_prompt(self, customer: Customer, conversation_stage: str = "greeting") -> str:
        """Generate dynamic sales prompt based on customer and conversation stage"""
        
        base_prompt = f"""
You are Sarah, an experienced and friendly sales representative for Premium Paper Solutions, a receipt roll supplier company. You are calling {customer.name} at {customer.business_name} to sell high-quality thermal receipt rolls.

CUSTOMER INFO:
- Name: {customer.name}
- Business: {customer.business_name}
- Status: {customer.status}
- Notes: {customer.notes}

PRODUCTS TO SELL:
"""
        
        for product in self.products:
            base_prompt += f"- {product.name} ({product.size}): ${product.price} - {product.description}\n"
        
        base_prompt += f"""

CONVERSATION STAGE: {conversation_stage}

PERSONALITY & APPROACH:
- Be warm, professional, and conversational
- Listen actively to their responses
- Ask qualifying questions about their business needs
- Handle objections confidently but respectfully
- Always aim to get them to accept a free sample pack
- Keep the conversation natural and not overly scripted
- Show genuine interest in helping their business

SALES OBJECTIVES:
1. Qualify their current receipt roll usage and pain points
2. Present value proposition (better quality, cost savings, convenience)
3. Handle any objections professionally
4. Close for a free sample pack (no obligation)
5. If they accept samples, get shipping address and contact info

KEY TALKING POINTS:
- Our rolls last 40% longer than standard ones
- Clients typically save $50-200/month
- Better print quality means happier customers
- Free sample pack with no obligation
- Convenient regular delivery service

IMPORTANT RULES:
- Keep responses conversational and under 30 seconds
- Ask one question at a time
- Let them talk and respond to their specific concerns
- If they're not interested, politely ask why and try to address concerns
- Always end with a soft close or next step
- Be prepared to take their information for follow-up

Remember: You're not just selling paper - you're solving business problems and helping them save money while improving their customer experience.
"""
        
        return base_prompt

    async def simulate_ai_conversation(self, customer: Customer) -> Dict:
        """Simulate an AI conversation with OpenAI (for testing without LiveKit)"""
        try:
            # Get AI response for this customer
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": self.get_sales_prompt(customer, "greeting")},
                    {"role": "user", "content": f"Hello, this is {customer.name} from {customer.business_name}. What can I do for you?"}
                ],
                max_tokens=150,
                temperature=0.7
            )
            
            ai_response = response.choices[0].message.content
            
            # Simulate different outcomes based on keywords in response
            if any(word in ai_response.lower() for word in ["sample", "try", "interested", "yes"]):
                outcome = "sample_requested"
                notes = "Customer interested in samples"
            elif any(word in ai_response.lower() for word in ["not interested", "no", "busy"]):
                outcome = "not_interested" 
                notes = "Customer not interested at this time"
            elif any(word in ai_response.lower() for word in ["callback", "call back", "later"]):
                outcome = "callback"
                notes = "Customer requested callback"
            else:
                outcome = "interested"
                notes = "Customer showed interest, needs follow-up"
            
            return {
                "outcome": outcome,
                "notes": notes,
                "ai_response": ai_response
            }
            
        except Exception as e:
            return {
                "outcome": "error",
                "notes": f"AI conversation failed: {str(e)}",
                "ai_response": ""
            }

    async def make_sales_call(self, customer: Customer) -> Dict:
        """Make an outbound sales call to a customer"""
        
        logger.info(f"Starting sales call to {customer.name} at {customer.business_name}")
        
        # Initialize call tracking
        call_result = {
            "customer": customer.name,
            "phone": customer.phone,
            "start_time": datetime.now().isoformat(),
            "status": "calling",
            "outcome": None,
            "notes": "",
            "follow_up_needed": False
        }
        
        try:
            # Simulate AI conversation using OpenAI
            # In future: This will use LiveKit for real voice calls
            conversation_result = await self.simulate_ai_conversation(customer)
            logger.info(f"Simulating call to {customer.phone}")
            
            # Update call result based on AI conversation
            call_result.update({
                "status": "completed",
                "end_time": datetime.now().isoformat(),
                "outcome": conversation_result["outcome"],
                "notes": conversation_result["notes"],
                "follow_up_needed": conversation_result["outcome"] in ["interested", "callback", "sample_requested"],
                "ai_response": conversation_result["ai_response"]
            })
            
            # Update customer status
            customer.status = "contacted"
            customer.last_contact = datetime.now().isoformat()
            
            logger.info(f"Call completed successfully for {customer.name}")
            
        except Exception as e:
            logger.error(f"Call failed for {customer.name}: {str(e)}")
            call_result.update({
                "status": "failed",
                "outcome": "error",
                "notes": f"Call failed: {str(e)}",
                "end_time": datetime.now().isoformat()
            })
        
        return call_result

    async def process_call_queue(self, customers: List[Customer]) -> List[Dict]:
        """Process a queue of customers for outbound calls"""
        
        logger.info(f"Starting call queue processing for {len(customers)} customers")
        results = []
        
        for customer in customers:
            # Add delay between calls to be respectful
            if results:  # Not the first call
                logger.info("Waiting 30 seconds between calls...")
                await asyncio.sleep(30)
            
            result = await self.make_sales_call(customer)
            results.append(result)
            
            # Log progress
            logger.info(f"Call {len(results)}/{len(customers)} completed - {result['outcome']}")
        
        return results

    def generate_call_report(self, results: List[Dict]) -> str:
        """Generate a summary report of calling session"""
        
        total_calls = len(results)
        successful = len([r for r in results if r['status'] == 'completed'])
        failed = len([r for r in results if r['status'] == 'failed'])
        
        outcomes = {}
        for result in results:
            outcome = result.get('outcome', 'unknown')
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
        
        report = f"""
=== SALES CALL REPORT ===
Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}

SUMMARY:
- Total Calls: {total_calls}
- Successful: {successful}
- Failed: {failed}
- Success Rate: {(successful/total_calls*100):.1f}%

OUTCOMES:
"""
        for outcome, count in outcomes.items():
            report += f"- {outcome.replace('_', ' ').title()}: {count}\n"
        
        report += "\nDETAILS:\n"
        for result in results:
            report += f"- {result['customer']} ({result['phone']}): {result['outcome']} - {result['notes']}\n"
        
        return report

# Example usage and test function
async def main():
    """Test the sales agent with sample customers"""
    
    # Configuration (these would come from environment variables)
    OPENAI_API_KEY = "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"
    LIVEKIT_URL = "ws://localhost:7880"
    LIVEKIT_TOKEN = "your-token"
    
    # Initialize the sales agent
    agent = ReceiptRollsSalesAgent(OPENAI_API_KEY, LIVEKIT_URL, LIVEKIT_TOKEN)
    
    # Sample customers (this would come from a database)
    customers = [
        Customer("John Smith", "+1-555-0101", "Smith's Corner Store"),
        Customer("Maria Garcia", "+1-555-0102", "Garcia Family Restaurant"),
        Customer("David Chen", "+1-555-0103", "Chen's Electronics"),
    ]
    
    # Process the call queue
    results = await agent.process_call_queue(customers)
    
    # Generate and print report
    report = agent.generate_call_report(results)
    print(report)
    
    return results

if __name__ == "__main__":
    # Run the sales agent
    asyncio.run(main())