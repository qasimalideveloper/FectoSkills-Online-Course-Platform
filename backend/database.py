import sqlite3
import os
from contextlib import contextmanager
from werkzeug.security import generate_password_hash, check_password_hash

# Configuration
DB_NAME = os.path.abspath(os.path.join(os.path.dirname(__file__), "db", "database.db"))

@contextmanager
def get_db():
    """Context manager for SQLite connections. Ensures connection is closed automatically."""
    db_dir = os.path.dirname(DB_NAME)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Initializes the database schema and performs necessary migrations."""
    os.makedirs(os.path.join(os.path.dirname(__file__), "db"), exist_ok=True)
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Users Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                phone TEXT NOT NULL UNIQUE,
                email TEXT UNIQUE,
                password TEXT NOT NULL,
                referral_code TEXT NOT NULL UNIQUE,
                referred_by TEXT,
                wallet_balance REAL DEFAULT 0.0,
                has_purchased BOOLEAN DEFAULT 0,
                is_active INTEGER DEFAULT 1, -- For Soft Delete
                fecto_id TEXT UNIQUE,
                avatar_path TEXT,
                token TEXT,
                token_expiry TIMESTAMP,
                is_banned BOOLEAN DEFAULT 0,
                ban_reason TEXT,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 2. Courses Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT,
                image_url TEXT
            )
        ''')

        # 3. UserCourses Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_courses (
                user_id INTEGER,
                course_id INTEGER,
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(course_id) REFERENCES courses(id),
                PRIMARY KEY(user_id, course_id)
            )
        ''')

        # 4. Transactions Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                course_id INTEGER,
                type TEXT NOT NULL, -- 'purchase', 'withdrawal', 'commission'
                amount REAL NOT NULL,
                status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
                description TEXT,
                screenshot_path TEXT,
                target_account TEXT,
                public_id TEXT UNIQUE,
                referred_user_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved_at TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(referred_user_id) REFERENCES users(id)
            )
        ''')
        
        # 5. Feedback Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # 6. UserProgress Table (Cloud Sync)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_progress (
                user_id INTEGER,
                course_id INTEGER,
                class_id INTEGER,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                PRIMARY KEY(user_id, course_id, class_id)
            )
        ''')

        # 6. Support Chats Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS support_chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                session_id TEXT,
                message TEXT NOT NULL,
                sender_type TEXT NOT NULL, -- 'user' or 'admin'
                is_read BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # 7. User Notifications Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL, -- 'success', 'info', 'warning', 'chat'
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        # 8. Admins Table (Security)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                failed_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                token TEXT,
                token_expiry TIMESTAMP
            )
        ''')

        # 9. Course Classes (Chapters)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS course_classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                class_order INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                FOREIGN KEY(course_id) REFERENCES courses(id)
            )
        ''')

        # 10. Class Steps (Interactions)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS class_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                step_order INTEGER NOT NULL,
                type TEXT NOT NULL, -- 'text', 'video', 'quiz'
                title TEXT,
                content_json TEXT, -- Stores detail like video_url, quiz options
                xp_reward INTEGER DEFAULT 10,
                FOREIGN KEY(class_id) REFERENCES course_classes(id)
            )
        ''')

        # --- MIGRATIONS ---
        # Check for new columns in existing users table
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_banned' not in columns:
            print("Migrating: Adding is_banned to users table")
            cursor.execute("ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT 0")
            
        if 'ban_reason' not in columns:
            print("Migrating: Adding ban_reason to users table")
            cursor.execute("ALTER TABLE users ADD COLUMN ban_reason TEXT")
            
        # ------------------


        # 11. User Progress
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_progress (
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                completed_class_id INTEGER,
                completed_step_id INTEGER,
                total_xp INTEGER DEFAULT 0,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, course_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(course_id) REFERENCES courses(id)
            )
        ''')
        
        # Seed Default Admin (anginat / lakarsheikh321)
        cursor.execute("SELECT id FROM admins WHERE username = ?", ("anginat",))
        if not cursor.fetchone():
            default_pass = hash_password("lakarsheikh321")
            cursor.execute("INSERT INTO admins (username, password) VALUES (?, ?)", ("anginat", default_pass))
        else:
            # Optional: Overwrite password to ensure it matches the request
            default_pass = hash_password("lakarsheikh321")
            cursor.execute("UPDATE admins SET password = ? WHERE username = ?", (default_pass, "anginat"))

        # --- Migrations ---
        
        # Check Transactions columns
        cursor.execute("PRAGMA table_info(transactions)")
        txn_cols = [row[1] for row in cursor.fetchall()]
        if 'course_id' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN course_id INTEGER")
        if 'public_id' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN public_id TEXT")
        if 'rejection_reason' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN rejection_reason TEXT")
        if 'withdrawal_method' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN withdrawal_method TEXT")
        if 'account_title' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN account_title TEXT")
        if 'bank_name' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN bank_name TEXT")
        if 'referred_user_id' not in txn_cols:
            cursor.execute("ALTER TABLE transactions ADD COLUMN referred_user_id INTEGER")
            
        # Check Courses columns
        cursor.execute("PRAGMA table_info(courses)")
        course_cols = [row[1] for row in cursor.fetchall()]
        if 'image_url' not in course_cols:
            cursor.execute("ALTER TABLE courses ADD COLUMN image_url TEXT")

        # Check Users columns
        cursor.execute("PRAGMA table_info(users)")
        user_cols = [row[1] for row in cursor.fetchall()]
        if 'is_active' not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
        if 'fecto_id' not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN fecto_id TEXT")
        if 'avatar_path' not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN avatar_path TEXT")

        # Check Support Chats columns
        cursor.execute("PRAGMA table_info(support_chats)")
        chat_cols = [row[1] for row in cursor.fetchall()]
        if 'session_id' not in chat_cols:
            cursor.execute("ALTER TABLE support_chats ADD COLUMN session_id TEXT")

        # --- Default Data ---
        import json
        courses_dir = os.path.join(os.path.dirname(__file__), "courses")
        if os.path.exists(courses_dir):
            for filename in sorted(os.listdir(courses_dir)):
                if filename.endswith(".json"):
                    filepath = os.path.join(courses_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            course_data = json.load(f)
                        
                        # Check if course exists
                        cursor.execute("SELECT id FROM courses WHERE title = ?", (course_data['title'],))
                        existing_course = cursor.fetchone()
                        
                        if not existing_course:
                            # Insert Course
                            cursor.execute(
                                "INSERT INTO courses (title, price, description, image_url) VALUES (?, ?, ?, ?)",
                                (course_data['title'], course_data['price'], course_data['description'], course_data.get('image', ''))
                            )
                            course_id = cursor.lastrowid
                        else:
                            # Update existing course metadata
                            course_id = existing_course['id']
                            cursor.execute(
                                "UPDATE courses SET price = ?, description = ?, image_url = ? WHERE id = ?",
                                (course_data['price'], course_data['description'], course_data.get('image', ''), course_id)
                            )
                        
                        # Sync Classes
                        for class_item in course_data.get('classes', []):
                            cursor.execute(
                                "SELECT id FROM course_classes WHERE course_id = ? AND class_order = ?",
                                (course_id, class_item['order'])
                            )
                            existing_class = cursor.fetchone()
                            
                            if not existing_class:
                                cursor.execute(
                                    "INSERT INTO course_classes (course_id, class_order, title, description) VALUES (?, ?, ?, ?)",
                                    (course_id, class_item['order'], class_item['title'], class_item.get('description', ''))
                                )
                                class_id = cursor.lastrowid
                            else:
                                class_id = existing_class['id']
                                cursor.execute(
                                    "UPDATE course_classes SET title = ?, description = ? WHERE id = ?",
                                    (class_item['title'], class_item.get('description', ''), class_id)
                                )
                            
                            # Sync Steps
                            for step in class_item.get('steps', []):
                                cursor.execute(
                                    "SELECT id FROM class_steps WHERE class_id = ? AND step_order = ?",
                                    (class_id, step['order'])
                                )
                                existing_step = cursor.fetchone()
                                
                                if not existing_step:
                                    cursor.execute(
                                        "INSERT INTO class_steps (class_id, step_order, type, title, content_json, xp_reward) VALUES (?, ?, ?, ?, ?, ?)",
                                        (class_id, step['order'], step['type'], step['title'], json.dumps(step['content']), step.get('xp', 10))
                                    )
                                else:
                                    cursor.execute(
                                        "UPDATE class_steps SET type = ?, title = ?, content_json = ?, xp_reward = ? WHERE id = ?",
                                        (step['type'], step['title'], json.dumps(step['content']), step.get('xp', 10), existing_step['id'])
                                    )
                        
                        print(f"Synchronized course from JSON: {course_data['title']}")
                    except Exception as e:
                        print(f"Error seeding {filename}: {e}")

    print("Database foundation initialized.")

def generate_random_id(length=8, prefix=""):
    """Generates a random unique ID with an optional prefix."""
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    unique_part = ''.join(random.choices(chars, k=length))
    return f"{prefix}{unique_part}"

def generate_referral_code():
    """Generates a random 8-character referral code."""
    return generate_random_id(8)

def allowed_file(filename, allowed_extensions):
    """Checks if a filename has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def hash_password(password):
    """Hashes a plain-text password."""
    return generate_password_hash(password)

def check_password(hashed_password, plain_password):
    """Verifies a password against its hash. Handles transition from plain-text."""
    if plain_password == hashed_password: # Legacy support for plain-text
        return True
    try:
        return check_password_hash(hashed_password, plain_password)
    except Exception:
        return False
