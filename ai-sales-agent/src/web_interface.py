"""
Web Interface for AI Sales Agent Management
FastAPI web app to manage customers, campaigns, and view call results
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import logging
from datetime import datetime

from customer_manager import CustomerManager, Customer
from sales_agent import ReceiptRollsSalesAgent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Sales Agent Dashboard", version="1.0.0")

# Initialize managers
customer_manager = CustomerManager("data/customers.db")
sales_agent = None  # Will be initialized with proper credentials

# Pydantic models
class CustomerCreate(BaseModel):
    name: str
    phone: str
    business_name: str
    business_type: str = ""
    email: str = ""
    address: str = ""
    estimated_monthly_usage: int = 0
    current_supplier: str = ""
    best_contact_time: str = ""
    notes: str = ""

class CampaignStart(BaseModel):
    max_calls: int = 10
    prioritize_by: str = "new"
    delay_between_calls: int = 30  # seconds

# Global variables for campaign tracking
current_campaign = None
campaign_results = []

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Main dashboard page"""
    return HTMLResponse(content="""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Sales Agent Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">
                <i class="fas fa-phone-alt text-blue-600 mr-3"></i>
                AI Sales Agent Dashboard
            </h1>
            <p class="text-gray-600">Automated outbound calling for receipt roll sales</p>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center">
                    <i class="fas fa-users text-blue-600 text-2xl mr-4"></i>
                    <div>
                        <p class="text-gray-600 text-sm">Total Customers</p>
                        <p id="total-customers" class="text-2xl font-bold text-gray-800">-</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center">
                    <i class="fas fa-phone text-green-600 text-2xl mr-4"></i>
                    <div>
                        <p class="text-gray-600 text-sm">Calls Today</p>
                        <p id="calls-today" class="text-2xl font-bold text-gray-800">-</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center">
                    <i class="fas fa-handshake text-yellow-600 text-2xl mr-4"></i>
                    <div>
                        <p class="text-gray-600 text-sm">Interested Leads</p>
                        <p id="interested-leads" class="text-2xl font-bold text-gray-800">-</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center">
                    <i class="fas fa-dollar-sign text-green-600 text-2xl mr-4"></i>
                    <div>
                        <p class="text-gray-600 text-sm">Sales Closed</p>
                        <p id="sales-closed" class="text-2xl font-bold text-gray-800">-</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Campaign Control -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-play-circle text-green-600 mr-2"></i>
                Campaign Control
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Max Calls</label>
                    <input type="number" id="max-calls" value="10" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Prioritize By</label>
                    <select id="prioritize-by" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="new">New Leads</option>
                        <option value="interested">Interested</option>
                        <option value="callback_requested">Callbacks</option>
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Delay (seconds)</label>
                    <input type="number" id="delay-calls" value="30" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                </div>
            </div>
            
            <div class="mt-4">
                <button id="start-campaign" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md mr-4">
                    <i class="fas fa-play mr-2"></i>Start Campaign
                </button>
                <button id="stop-campaign" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md" disabled>
                    <i class="fas fa-stop mr-2"></i>Stop Campaign
                </button>
            </div>
            
            <div id="campaign-status" class="mt-4 p-4 bg-gray-50 rounded-md hidden">
                <p class="text-sm text-gray-600">Campaign Status: <span id="status-text">Idle</span></p>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div id="progress-bar" class="bg-green-600 h-2 rounded-full" style="width: 0%"></div>
                </div>
            </div>
        </div>

        <!-- Customer Management -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- Add Customer -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-user-plus text-blue-600 mr-2"></i>
                    Add Customer
                </h2>
                
                <form id="add-customer-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" id="customer-name" placeholder="Contact Name" class="px-3 py-2 border border-gray-300 rounded-md" required>
                        <input type="tel" id="customer-phone" placeholder="Phone Number" class="px-3 py-2 border border-gray-300 rounded-md" required>
                    </div>
                    
                    <input type="text" id="business-name" placeholder="Business Name" class="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select id="business-type" class="px-3 py-2 border border-gray-300 rounded-md">
                            <option value="">Business Type</option>
                            <option value="restaurant">Restaurant</option>
                            <option value="retail">Retail Store</option>
                            <option value="convenience">Convenience Store</option>
                            <option value="service">Service Business</option>
                            <option value="other">Other</option>
                        </select>
                        <input type="number" id="monthly-usage" placeholder="Est. Monthly Rolls" class="px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                    
                    <textarea id="customer-notes" placeholder="Notes..." class="w-full px-3 py-2 border border-gray-300 rounded-md h-20"></textarea>
                    
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md">
                        <i class="fas fa-plus mr-2"></i>Add Customer
                    </button>
                </form>
            </div>
            
            <!-- Recent Results -->
            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-chart-line text-green-600 mr-2"></i>
                    Recent Call Results
                </h2>
                
                <div id="recent-results" class="space-y-3">
                    <p class="text-gray-500 text-center">No recent calls</p>
                </div>
            </div>
        </div>

        <!-- Customer List -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-list text-purple-600 mr-2"></i>
                Customer Database
            </h2>
            
            <div class="overflow-x-auto">
                <table class="w-full table-auto">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-4 py-2 text-left">Name</th>
                            <th class="px-4 py-2 text-left">Business</th>
                            <th class="px-4 py-2 text-left">Phone</th>
                            <th class="px-4 py-2 text-left">Status</th>
                            <th class="px-4 py-2 text-left">Last Contact</th>
                            <th class="px-4 py-2 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customer-table">
                        <tr>
                            <td colspan="6" class="px-4 py-8 text-center text-gray-500">Loading customers...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        // Global variables
        let campaignRunning = false;
        let campaignInterval = null;

        // Load initial data
        document.addEventListener('DOMContentLoaded', function() {
            loadStats();
            loadCustomers();
            loadRecentResults();
        });

        // Load statistics
        async function loadStats() {
            try {
                const response = await axios.get('/api/stats');
                const stats = response.data;
                
                document.getElementById('total-customers').textContent = stats.total_customers;
                document.getElementById('calls-today').textContent = stats.recent_calls_7_days;
                document.getElementById('interested-leads').textContent = stats.status_breakdown.interested || 0;
                document.getElementById('sales-closed').textContent = stats.status_breakdown.sold || 0;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        // Load customers
        async function loadCustomers() {
            try {
                const response = await axios.get('/api/customers');
                const customers = response.data;
                
                const tableBody = document.getElementById('customer-table');
                if (customers.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No customers found</td></tr>';
                    return;
                }
                
                tableBody.innerHTML = customers.map(customer => `
                    <tr>
                        <td class="px-4 py-2">${customer.name}</td>
                        <td class="px-4 py-2">${customer.business_name}</td>
                        <td class="px-4 py-2">${customer.phone}</td>
                        <td class="px-4 py-2">
                            <span class="px-2 py-1 text-xs rounded-full ${getStatusColor(customer.status)}">
                                ${customer.status}
                            </span>
                        </td>
                        <td class="px-4 py-2">${customer.last_contact ? new Date(customer.last_contact).toLocaleDateString() : 'Never'}</td>
                        <td class="px-4 py-2">
                            <button onclick="editCustomer('${customer.phone}')" class="text-blue-600 hover:text-blue-800 mr-2">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="callCustomer('${customer.phone}')" class="text-green-600 hover:text-green-800">
                                <i class="fas fa-phone"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            } catch (error) {
                console.error('Error loading customers:', error);
            }
        }

        // Get status color class
        function getStatusColor(status) {
            const colors = {
                'new': 'bg-blue-100 text-blue-800',
                'contacted': 'bg-yellow-100 text-yellow-800',
                'interested': 'bg-green-100 text-green-800',
                'not_interested': 'bg-red-100 text-red-800',
                'sold': 'bg-purple-100 text-purple-800',
                'do_not_call': 'bg-gray-100 text-gray-800'
            };
            return colors[status] || 'bg-gray-100 text-gray-800';
        }

        // Add customer form
        document.getElementById('add-customer-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const customerData = {
                name: document.getElementById('customer-name').value,
                phone: document.getElementById('customer-phone').value,
                business_name: document.getElementById('business-name').value,
                business_type: document.getElementById('business-type').value,
                estimated_monthly_usage: parseInt(document.getElementById('monthly-usage').value) || 0,
                notes: document.getElementById('customer-notes').value
            };
            
            try {
                await axios.post('/api/customers', customerData);
                alert('Customer added successfully!');
                this.reset();
                loadCustomers();
                loadStats();
            } catch (error) {
                alert('Error adding customer: ' + error.response.data.detail);
            }
        });

        // Start campaign
        document.getElementById('start-campaign').addEventListener('click', async function() {
            const campaignData = {
                max_calls: parseInt(document.getElementById('max-calls').value),
                prioritize_by: document.getElementById('prioritize-by').value,
                delay_between_calls: parseInt(document.getElementById('delay-calls').value)
            };
            
            try {
                await axios.post('/api/campaign/start', campaignData);
                
                // Update UI
                campaignRunning = true;
                this.disabled = true;
                document.getElementById('stop-campaign').disabled = false;
                document.getElementById('campaign-status').classList.remove('hidden');
                document.getElementById('status-text').textContent = 'Running';
                
                // Start progress monitoring
                monitorCampaign();
                
            } catch (error) {
                alert('Error starting campaign: ' + error.response.data.detail);
            }
        });

        // Stop campaign
        document.getElementById('stop-campaign').addEventListener('click', async function() {
            try {
                await axios.post('/api/campaign/stop');
                
                // Update UI
                campaignRunning = false;
                document.getElementById('start-campaign').disabled = false;
                this.disabled = true;
                document.getElementById('status-text').textContent = 'Stopped';
                
                if (campaignInterval) {
                    clearInterval(campaignInterval);
                }
                
            } catch (error) {
                alert('Error stopping campaign: ' + error.response.data.detail);
            }
        });

        // Monitor campaign progress
        function monitorCampaign() {
            campaignInterval = setInterval(async () => {
                try {
                    const response = await axios.get('/api/campaign/status');
                    const status = response.data;
                    
                    if (status.running) {
                        const progress = (status.completed / status.total) * 100;
                        document.getElementById('progress-bar').style.width = progress + '%';
                        document.getElementById('status-text').textContent = `Running (${status.completed}/${status.total})`;
                    } else {
                        campaignRunning = false;
                        document.getElementById('start-campaign').disabled = false;
                        document.getElementById('stop-campaign').disabled = true;
                        document.getElementById('status-text').textContent = 'Completed';
                        clearInterval(campaignInterval);
                        
                        // Reload data
                        loadStats();
                        loadCustomers();
                        loadRecentResults();
                    }
                } catch (error) {
                    console.error('Error monitoring campaign:', error);
                }
            }, 2000);
        }

        // Load recent results
        async function loadRecentResults() {
            try {
                const response = await axios.get('/api/campaign/results');
                const results = response.data;
                
                const resultsDiv = document.getElementById('recent-results');
                if (results.length === 0) {
                    resultsDiv.innerHTML = '<p class="text-gray-500 text-center">No recent calls</p>';
                    return;
                }
                
                resultsDiv.innerHTML = results.slice(0, 5).map(result => `
                    <div class="p-3 bg-gray-50 rounded-md">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-medium">${result.customer}</p>
                                <p class="text-sm text-gray-600">${result.phone}</p>
                            </div>
                            <span class="px-2 py-1 text-xs rounded-full ${getOutcomeColor(result.outcome)}">
                                ${result.outcome}
                            </span>
                        </div>
                        <p class="text-sm text-gray-700 mt-1">${result.notes}</p>
                        <p class="text-xs text-gray-500">${new Date(result.start_time).toLocaleString()}</p>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error loading recent results:', error);
            }
        }

        // Get outcome color class
        function getOutcomeColor(outcome) {
            const colors = {
                'sample_requested': 'bg-green-100 text-green-800',
                'interested': 'bg-blue-100 text-blue-800',
                'not_interested': 'bg-red-100 text-red-800',
                'callback': 'bg-yellow-100 text-yellow-800',
                'error': 'bg-gray-100 text-gray-800'
            };
            return colors[outcome] || 'bg-gray-100 text-gray-800';
        }

        // Placeholder functions for future implementation
        function editCustomer(phone) {
            alert('Edit customer feature coming soon!');
        }

        function callCustomer(phone) {
            alert('Individual call feature coming soon!');
        }
    </script>
</body>
</html>
    """)

@app.get("/api/stats")
async def get_stats():
    """Get database statistics"""
    return customer_manager.get_stats()

@app.get("/api/customers")
async def get_customers():
    """Get all customers"""
    # For now, get all customers with status 'new' or 'contacted'
    customers = []
    for status in ['new', 'contacted', 'interested', 'not_interested', 'sold']:
        customers.extend(customer_manager.get_customers_by_status(status))
    
    # Convert to dict format for JSON response
    return [
        {
            "name": c.name,
            "phone": c.phone,
            "business_name": c.business_name,
            "business_type": c.business_type,
            "email": c.email,
            "status": c.status,
            "last_contact": c.last_contact,
            "notes": c.notes,
            "estimated_monthly_usage": c.estimated_monthly_usage
        }
        for c in customers
    ]

@app.post("/api/customers")
async def add_customer(customer_data: CustomerCreate):
    """Add a new customer"""
    customer = Customer(
        name=customer_data.name,
        phone=customer_data.phone,
        business_name=customer_data.business_name,
        business_type=customer_data.business_type,
        email=customer_data.email,
        address=customer_data.address,
        estimated_monthly_usage=customer_data.estimated_monthly_usage,
        current_supplier=customer_data.current_supplier,
        best_contact_time=customer_data.best_contact_time,
        notes=customer_data.notes
    )
    
    success = customer_manager.add_customer(customer)
    if not success:
        raise HTTPException(status_code=400, detail="Customer with this phone number already exists")
    
    return {"message": "Customer added successfully"}

@app.post("/api/campaign/start")
async def start_campaign(background_tasks: BackgroundTasks, campaign_data: CampaignStart):
    """Start a calling campaign"""
    global current_campaign, campaign_results
    
    if current_campaign and current_campaign.get("running"):
        raise HTTPException(status_code=400, detail="Campaign already running")
    
    # Get customers to call
    customers = customer_manager.get_calling_queue(
        max_calls=campaign_data.max_calls,
        prioritize_by=campaign_data.prioritize_by
    )
    
    if not customers:
        raise HTTPException(status_code=400, detail="No customers found to call")
    
    # Initialize campaign tracking
    current_campaign = {
        "running": True,
        "total": len(customers),
        "completed": 0,
        "start_time": datetime.now().isoformat(),
        "customers": customers
    }
    campaign_results = []
    
    # Start campaign in background
    background_tasks.add_task(run_campaign, customers, campaign_data.delay_between_calls)
    
    return {"message": f"Campaign started with {len(customers)} customers"}

@app.post("/api/campaign/stop")
async def stop_campaign():
    """Stop the running campaign"""
    global current_campaign
    
    if current_campaign:
        current_campaign["running"] = False
    
    return {"message": "Campaign stopped"}

@app.get("/api/campaign/status")
async def get_campaign_status():
    """Get current campaign status"""
    if not current_campaign:
        return {"running": False, "total": 0, "completed": 0}
    
    return {
        "running": current_campaign.get("running", False),
        "total": current_campaign.get("total", 0),
        "completed": current_campaign.get("completed", 0),
        "start_time": current_campaign.get("start_time")
    }

@app.get("/api/campaign/results")
async def get_campaign_results():
    """Get campaign results"""
    return campaign_results

async def run_campaign(customers: List[Customer], delay: int):
    """Run the calling campaign in background"""
    global current_campaign, campaign_results, sales_agent
    
    logger.info(f"Starting campaign with {len(customers)} customers")
    
    # Initialize sales agent if not already done
    if not sales_agent:
        # These would come from environment variables in production
        sales_agent = ReceiptRollsSalesAgent(
            openai_api_key="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",
            livekit_url="ws://localhost:7880",
            livekit_token="your-token"
        )
    
    for i, customer in enumerate(customers):
        if not current_campaign.get("running"):
            logger.info("Campaign stopped by user")
            break
        
        try:
            # Make the call
            result = await sales_agent.make_sales_call(customer)
            campaign_results.append(result)
            
            # Update customer status based on result
            if result["outcome"] == "sample_requested":
                customer_manager.update_customer_status(
                    customer.phone, "interested", result["notes"]
                )
            elif result["outcome"] == "not_interested":
                customer_manager.update_customer_status(
                    customer.phone, "not_interested", result["notes"]
                )
            else:
                customer_manager.update_customer_status(
                    customer.phone, "contacted", result["notes"]
                )
            
            # Log call history
            customer_manager.log_call_history(
                customer.phone,
                result["outcome"],
                0,  # Duration would be calculated in real implementation
                result["notes"],
                result["follow_up_needed"]
            )
            
            # Update progress
            current_campaign["completed"] = i + 1
            
            logger.info(f"Call {i+1}/{len(customers)} completed: {result['outcome']}")
            
            # Wait between calls (except for last call)
            if i < len(customers) - 1 and current_campaign.get("running"):
                await asyncio.sleep(delay)
        
        except Exception as e:
            logger.error(f"Error in campaign call {i+1}: {e}")
            # Continue with next customer
    
    # Mark campaign as completed
    if current_campaign:
        current_campaign["running"] = False
        current_campaign["end_time"] = datetime.now().isoformat()
    
    logger.info("Campaign completed")

if __name__ == "__main__":
    import uvicorn
    
    # Create sample customers if database is empty
    stats = customer_manager.get_stats()
    if stats["total_customers"] == 0:
        from customer_manager import generate_sample_customers
        sample_customers = generate_sample_customers()
        for customer in sample_customers:
            customer_manager.add_customer(customer)
        logger.info("Added sample customers to database")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)