"""
Customer Database Manager for Receipt Roll Sales
Handles customer data, call history, and lead management
"""

import json
import csv
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import sqlite3
import logging

logger = logging.getLogger(__name__)

@dataclass
class Customer:
    """Customer data structure"""
    name: str
    phone: str
    business_name: str
    business_type: str = ""  # restaurant, retail, service, etc.
    email: str = ""
    address: str = ""
    last_contact: Optional[str] = None
    status: str = "new"  # new, contacted, interested, not_interested, sold, do_not_call
    notes: str = ""
    estimated_monthly_usage: int = 0  # rolls per month
    current_supplier: str = ""
    pain_points: str = ""
    best_contact_time: str = ""  # morning, afternoon, evening
    created_at: str = ""
    updated_at: str = ""

class CustomerManager:
    """Manages customer database operations"""
    
    def __init__(self, db_path: str = "data/customers.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize SQLite database with customers table"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                business_name TEXT NOT NULL,
                business_type TEXT,
                email TEXT,
                address TEXT,
                last_contact TEXT,
                status TEXT DEFAULT 'new',
                notes TEXT,
                estimated_monthly_usage INTEGER DEFAULT 0,
                current_supplier TEXT,
                pain_points TEXT,
                best_contact_time TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS call_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_phone TEXT,
                call_date TEXT,
                duration_seconds INTEGER,
                outcome TEXT,
                notes TEXT,
                follow_up_needed BOOLEAN,
                follow_up_date TEXT,
                agent_name TEXT,
                FOREIGN KEY (customer_phone) REFERENCES customers (phone)
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"Database initialized at {self.db_path}")
    
    def add_customer(self, customer: Customer) -> bool:
        """Add a new customer to the database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            now = datetime.now().isoformat()
            customer.created_at = now
            customer.updated_at = now
            
            cursor.execute('''
                INSERT INTO customers (
                    name, phone, business_name, business_type, email, address,
                    last_contact, status, notes, estimated_monthly_usage,
                    current_supplier, pain_points, best_contact_time,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                customer.name, customer.phone, customer.business_name,
                customer.business_type, customer.email, customer.address,
                customer.last_contact, customer.status, customer.notes,
                customer.estimated_monthly_usage, customer.current_supplier,
                customer.pain_points, customer.best_contact_time,
                customer.created_at, customer.updated_at
            ))
            
            conn.commit()
            conn.close()
            logger.info(f"Added customer: {customer.name} ({customer.phone})")
            return True
            
        except sqlite3.IntegrityError:
            logger.warning(f"Customer with phone {customer.phone} already exists")
            return False
        except Exception as e:
            logger.error(f"Error adding customer: {e}")
            return False
    
    def get_customers_by_status(self, status: str) -> List[Customer]:
        """Get all customers with a specific status"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM customers WHERE status = ?', (status,))
        rows = cursor.fetchall()
        conn.close()
        
        customers = []
        for row in rows:
            customer = Customer(
                name=row[1], phone=row[2], business_name=row[3],
                business_type=row[4], email=row[5], address=row[6],
                last_contact=row[7], status=row[8], notes=row[9],
                estimated_monthly_usage=row[10], current_supplier=row[11],
                pain_points=row[12], best_contact_time=row[13],
                created_at=row[14], updated_at=row[15]
            )
            customers.append(customer)
        
        return customers
    
    def update_customer_status(self, phone: str, status: str, notes: str = "") -> bool:
        """Update customer status and notes"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            now = datetime.now().isoformat()
            
            cursor.execute('''
                UPDATE customers 
                SET status = ?, notes = ?, last_contact = ?, updated_at = ?
                WHERE phone = ?
            ''', (status, notes, now, now, phone))
            
            conn.commit()
            conn.close()
            logger.info(f"Updated customer {phone} status to {status}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating customer status: {e}")
            return False
    
    def log_call_history(self, phone: str, outcome: str, duration: int = 0, 
                        notes: str = "", follow_up_needed: bool = False,
                        follow_up_date: str = "", agent_name: str = "AI Agent") -> bool:
        """Log a call in the call history"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO call_history (
                    customer_phone, call_date, duration_seconds, outcome,
                    notes, follow_up_needed, follow_up_date, agent_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                phone, datetime.now().isoformat(), duration, outcome,
                notes, follow_up_needed, follow_up_date, agent_name
            ))
            
            conn.commit()
            conn.close()
            logger.info(f"Logged call for {phone}: {outcome}")
            return True
            
        except Exception as e:
            logger.error(f"Error logging call history: {e}")
            return False
    
    def import_from_csv(self, csv_file_path: str) -> int:
        """Import customers from CSV file"""
        imported_count = 0
        
        try:
            with open(csv_file_path, 'r', newline='') as csvfile:
                reader = csv.DictReader(csvfile)
                
                for row in reader:
                    customer = Customer(
                        name=row.get('name', ''),
                        phone=row.get('phone', ''),
                        business_name=row.get('business_name', ''),
                        business_type=row.get('business_type', ''),
                        email=row.get('email', ''),
                        address=row.get('address', ''),
                        estimated_monthly_usage=int(row.get('estimated_monthly_usage', 0)),
                        current_supplier=row.get('current_supplier', ''),
                        best_contact_time=row.get('best_contact_time', ''),
                        notes=row.get('notes', '')
                    )
                    
                    if self.add_customer(customer):
                        imported_count += 1
            
            logger.info(f"Imported {imported_count} customers from {csv_file_path}")
            
        except Exception as e:
            logger.error(f"Error importing from CSV: {e}")
        
        return imported_count
    
    def export_to_csv(self, csv_file_path: str, status: str = None) -> bool:
        """Export customers to CSV file"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            if status:
                cursor.execute('SELECT * FROM customers WHERE status = ?', (status,))
            else:
                cursor.execute('SELECT * FROM customers')
            
            rows = cursor.fetchall()
            conn.close()
            
            with open(csv_file_path, 'w', newline='') as csvfile:
                fieldnames = [
                    'name', 'phone', 'business_name', 'business_type', 'email',
                    'address', 'last_contact', 'status', 'notes',
                    'estimated_monthly_usage', 'current_supplier', 'pain_points',
                    'best_contact_time', 'created_at', 'updated_at'
                ]
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for row in rows:
                    writer.writerow({
                        'name': row[1], 'phone': row[2], 'business_name': row[3],
                        'business_type': row[4], 'email': row[5], 'address': row[6],
                        'last_contact': row[7], 'status': row[8], 'notes': row[9],
                        'estimated_monthly_usage': row[10], 'current_supplier': row[11],
                        'pain_points': row[12], 'best_contact_time': row[13],
                        'created_at': row[14], 'updated_at': row[15]
                    })
            
            logger.info(f"Exported customers to {csv_file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error exporting to CSV: {e}")
            return False
    
    def get_calling_queue(self, max_calls: int = 50, prioritize_by: str = "new") -> List[Customer]:
        """Get a prioritized list of customers to call"""
        
        # Priority order for calling
        status_priority = {
            "new": 1,
            "interested": 2,
            "callback_requested": 3,
            "contacted": 4
        }
        
        if prioritize_by == "new":
            target_statuses = ["new", "interested", "callback_requested"]
        else:
            target_statuses = [prioritize_by]
        
        all_customers = []
        for status in target_statuses:
            customers = self.get_customers_by_status(status)
            all_customers.extend(customers)
        
        # Sort by priority and limit
        all_customers.sort(key=lambda c: status_priority.get(c.status, 99))
        
        return all_customers[:max_calls]
    
    def get_stats(self) -> Dict:
        """Get database statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Customer counts by status
        cursor.execute('SELECT status, COUNT(*) FROM customers GROUP BY status')
        status_counts = dict(cursor.fetchall())
        
        # Total customers
        cursor.execute('SELECT COUNT(*) FROM customers')
        total_customers = cursor.fetchone()[0]
        
        # Recent call activity (last 7 days)
        cursor.execute('''
            SELECT COUNT(*) FROM call_history 
            WHERE call_date >= datetime('now', '-7 days')
        ''')
        recent_calls = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            "total_customers": total_customers,
            "status_breakdown": status_counts,
            "recent_calls_7_days": recent_calls
        }

# Sample data generator for testing
def generate_sample_customers() -> List[Customer]:
    """Generate sample customer data for testing"""
    
    sample_customers = [
        Customer(
            name="John Smith",
            phone="+1-555-0101",
            business_name="Smith's Corner Store",
            business_type="retail",
            email="john@smithsstore.com",
            address="123 Main St, Anytown, ST 12345",
            estimated_monthly_usage=25,
            current_supplier="Office Depot",
            best_contact_time="morning",
            notes="Owner mentioned they go through rolls quickly"
        ),
        Customer(
            name="Maria Garcia",
            phone="+1-555-0102",
            business_name="Garcia Family Restaurant",
            business_type="restaurant",
            email="maria@garciasrestaurant.com",
            address="456 Oak Ave, Foodtown, ST 12346",
            estimated_monthly_usage=50,
            current_supplier="Restaurant Supply Co",
            best_contact_time="afternoon",
            notes="High volume restaurant, quality is important"
        ),
        Customer(
            name="David Chen",
            phone="+1-555-0103",
            business_name="Chen's Electronics",
            business_type="retail",
            email="david@chenselectronics.com",
            address="789 Tech Blvd, Gadgetville, ST 12347",
            estimated_monthly_usage=15,
            current_supplier="Unknown",
            best_contact_time="evening",
            notes="Small electronics store, price-sensitive"
        ),
        Customer(
            name="Sarah Johnson",
            phone="+1-555-0104",
            business_name="Quick Mart Gas & Go",
            business_type="convenience",
            email="sarah@quickmart.com",
            address="321 Highway 1, Speedtown, ST 12348",
            estimated_monthly_usage=40,
            current_supplier="Regional Paper Supply",
            best_contact_time="morning",
            notes="24/7 operation, needs reliable supply"
        ),
        Customer(
            name="Mike Wilson",
            phone="+1-555-0105",
            business_name="Wilson's Auto Repair",
            business_type="service",
            email="mike@wilsonrepair.com",
            address="654 Service Dr, Fixittown, ST 12349",
            estimated_monthly_usage=10,
            current_supplier="Auto Parts Plus",
            best_contact_time="afternoon",
            notes="Auto shop, lower volume but steady"
        )
    ]
    
    return sample_customers

if __name__ == "__main__":
    # Test the customer manager
    manager = CustomerManager("../data/customers.db")
    
    # Add sample customers
    sample_customers = generate_sample_customers()
    for customer in sample_customers:
        manager.add_customer(customer)
    
    # Show stats
    stats = manager.get_stats()
    print(f"Database Stats: {stats}")
    
    # Get calling queue
    queue = manager.get_calling_queue(max_calls=3)
    print(f"\nCalling Queue ({len(queue)} customers):")
    for customer in queue:
        print(f"- {customer.name} at {customer.business_name} ({customer.phone})")