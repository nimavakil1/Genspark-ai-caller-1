#!/usr/bin/env python3
"""
AI Sales Agent Startup Script
Initializes the system and starts the web interface
"""

import os
import sys
import logging
from pathlib import Path

# Add src directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from customer_manager import CustomerManager, generate_sample_customers
from web_interface import app
import uvicorn

def setup_logging():
    """Configure logging"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('logs/sales_agent.log'),
            logging.StreamHandler()
        ]
    )

def setup_directories():
    """Create necessary directories"""
    directories = ['data', 'logs', 'config']
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
    print("✅ Directories created/verified")

def initialize_database():
    """Initialize customer database with sample data if empty"""
    db_path = "data/customers.db"
    customer_manager = CustomerManager(db_path)
    
    stats = customer_manager.get_stats()
    if stats["total_customers"] == 0:
        print("📋 Adding sample customers to database...")
        
        # Try to import from CSV first
        csv_path = "data/sample_customers.csv"
        if os.path.exists(csv_path):
            imported = customer_manager.import_from_csv(csv_path)
            print(f"✅ Imported {imported} customers from CSV")
        else:
            # Generate sample customers programmatically
            sample_customers = generate_sample_customers()
            for customer in sample_customers:
                customer_manager.add_customer(customer)
            print(f"✅ Added {len(sample_customers)} sample customers")
    else:
        print(f"📋 Database already has {stats['total_customers']} customers")
    
    return customer_manager

def main():
    """Main startup function"""
    print("🚀 Starting AI Sales Agent System")
    print("=" * 50)
    
    # Setup
    setup_directories()
    setup_logging()
    
    # Initialize database
    customer_manager = initialize_database()
    
    # Show current stats
    stats = customer_manager.get_stats()
    print(f"\n📊 Current Database Stats:")
    print(f"   Total Customers: {stats['total_customers']}")
    print(f"   Status Breakdown: {stats['status_breakdown']}")
    print(f"   Recent Calls (7 days): {stats['recent_calls_7_days']}")
    
    print(f"\n🌐 Starting Web Interface...")
    print(f"   Dashboard: http://localhost:8000")
    print(f"   API Docs: http://localhost:8000/docs")
    
    # Instructions for user
    print(f"\n📋 Getting Started:")
    print(f"   1. Open http://localhost:8000 in your browser")
    print(f"   2. Review the customer database")
    print(f"   3. Add new customers or import from CSV")
    print(f"   4. Configure and start a calling campaign")
    print(f"   5. Monitor call results and follow up with leads")
    
    print(f"\n🔧 System Features:")
    print(f"   ✅ Customer Management")
    print(f"   ✅ Automated Outbound Calling")
    print(f"   ✅ AI-Powered Sales Conversations")
    print(f"   ✅ Real-time Campaign Monitoring")
    print(f"   ✅ Lead Tracking & Follow-up")
    print(f"   🚧 LiveKit Integration (in development)")
    print(f"   🚧 Telnyx SIP Connection (in development)")
    
    print(f"\n" + "=" * 50)
    
    # Start the web server
    try:
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=8000,
            log_level="info",
            access_log=True
        )
    except KeyboardInterrupt:
        print(f"\n👋 AI Sales Agent System stopped")
    except Exception as e:
        print(f"❌ Error starting system: {e}")

if __name__ == "__main__":
    main()