from flask import Blueprint, request, jsonify, send_from_directory, current_app, g, make_response
import os
import re
import datetime
import sqlite3
from database import (
    get_db, hash_password, check_password, 
    generate_random_id, generate_referral_code, allowed_file
)

# ... (rest of imports)

import secrets
from functools import wraps
from extensions import limiter

# --- AUTH DECORATORS ---
def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.cookies.get('admin_token') or request.headers.get('x-admin-token')
        
        if not token:
            return api_response(False, "Missing admin token", status=401)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM admins WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP", (token,))
            if not cursor.fetchone():
                return api_response(False, "Invalid or expired admin token", status=401)
        return f(*args, **kwargs)
    return decorated_function

def require_user_token(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Priority: Cookie > Header
        token = request.cookies.get('token') or request.headers.get('x-auth-token')
        
        if not token:
            return api_response(False, "Missing auth token", status=401)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, referral_code, is_active, is_banned, ban_reason FROM users WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP", (token,))
            user = cursor.fetchone()
            
            if not user:
                return api_response(False, "Invalid or expired token", status=401)
            if not user['is_active']:
                 return api_response(False, "Account inactive", status=403)
            
            # Update last_seen
            conn.execute("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", (user['id'],))
            
            g.user = user # Store user context
            
            # Allow banned users to access mostly read-only or authorized-only states so frontend can show ban screen
            # But we might want to flag it in g.user to block specific actions later
            
        return f(*args, **kwargs)
    return decorated_function


# --- Response Helper ---
def api_response(success, message=None, data=None, status=200):
    """Wraps every response in the required {success, data} format."""
    response = {"success": success}
    payload = data if data is not None else {}
    if message:
        # Use 'error' key for failures to match frontend expectations
        key = "message" if success else "error"
        payload[key] = message
    response["data"] = payload
    return jsonify(response), status
# --- Blueprints ---

# --- Blueprints ---
auth_bp = Blueprint('auth', __name__)
wallet_bp = Blueprint('wallet', __name__)
admin_bp = Blueprint('admin', __name__)
support_bp = Blueprint('support', __name__)
notif_bp = Blueprint('notif', __name__)
util_bp = Blueprint('util', __name__)

# --- NOTIFICATION HELPER ---
def send_notification(user_id, n_type, title, message, conn=None):
    """Internal helper to insert a notification. If conn is provided, uses that connection."""
    try:
        if conn:
            # Use existing connection (within transaction)
            conn.execute('''
                INSERT INTO notifications (user_id, type, title, message)
                VALUES (?, ?, ?, ?)
            ''', (user_id, n_type, title, message))
        else:
            # Create new connection
            with get_db() as new_conn:
                new_conn.execute('''
                    INSERT INTO notifications (user_id, type, title, message)
                    VALUES (?, ?, ?, ?)
                ''', (user_id, n_type, title, message))
    except Exception as e:
        print(f"Error sending notification: {e}")

# ==========================================
# AUTH & USER ROUTES
# ==========================================

@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.json
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    username = data.get('username')
    phone = data.get('phone')
    email = data.get('email', '').strip() or None
    password = data.get('password')
    referred_by = data.get('referral_code')

    if not all([first_name, last_name, username, phone, password]):
        return api_response(False, "Missing required fields")

    # Space Check
    if any(' ' in x for x in [first_name, last_name, username, password]):
        return api_response(False, "Spaces are not allowed in Name, Username or Password")

    if len(password) < 8:
        return api_response(False, "Password must be at least 8 characters long")
    if len(password) > 128:
        return api_response(False, "Password must be 128 characters or less")

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Check unique fields individually for better error reporting
            cursor.execute('SELECT 1 FROM users WHERE username = ?', (username,))
            if cursor.fetchone():
                return api_response(False, "Username already exists")
            
            cursor.execute('SELECT 1 FROM users WHERE phone = ?', (phone,))
            if cursor.fetchone():
                return api_response(False, "Phone number already registered")
            
            if email:
                cursor.execute('SELECT 1 FROM users WHERE email = ?', (email,))
                if cursor.fetchone():
                    return api_response(False, "Email already exists")

            # Validate referral code
            if referred_by:
                cursor.execute('SELECT username FROM users WHERE referral_code = ?', (referred_by,))
                if not cursor.fetchone():
                    return api_response(False, "Invalid referral code")

            hashed_pass = hash_password(password)
            my_ref_code = generate_referral_code()
            fecto_id = generate_random_id(6, "#FS-")

            cursor.execute('''
                INSERT INTO users (first_name, last_name, username, phone, email, password, referral_code, referred_by, fecto_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (first_name, last_name, username, phone, email, hashed_pass, my_ref_code, referred_by, fecto_id))
            
            user_id = cursor.lastrowid

            # Generate and save session token for immediate auto-login
            token = secrets.token_hex(32)
            expiry = datetime.datetime.utcnow() + datetime.timedelta(days=7)
            cursor.execute("UPDATE users SET token=?, token_expiry=? WHERE id=?", (token, expiry, user_id))
            
            # Fetch full user record for frontend state
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            
            
            user_data = {
                "id": user['id'],
                "first_name": user['first_name'],
                "last_name": user['last_name'],
                "username": user['username'],
                "referral_code": user['referral_code'],
                "fecto_id": user['fecto_id'],
                "token": token,  
                "has_purchased": bool(user['has_purchased']),
                "wallet_balance": 0.0,
                "monthly_commission": 0.0,
                "commission_rate": 10,
                "created_at": user['created_at'],
                "email": user['email'],
                "phone": user['phone'],
                "avatar_path": user['avatar_path'],
                "referred_by_code": user['referred_by']
            }
            
        # Set Cookie
        resp, code = api_response(True, "Registration successful", {"user": user_data}, 201)
        resp = make_response(resp)
        resp.set_cookie('token', token, httponly=True, samesite='None', secure=True, max_age=7*24*3600)
        return resp
    except Exception as e:
        return api_response(False, str(e))


@auth_bp.route('/admin-login', methods=['POST'])
@limiter.limit("5 per minute")
def admin_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM admins WHERE username = ?", (username,))
        admin = cursor.fetchone()
        
        if not admin:
            return api_response(False, "Invalid credentials") # Security: generic message
            
        # Check Lockout
        if admin['locked_until']:
            locked_until = datetime.datetime.strptime(admin['locked_until'], '%Y-%m-%d %H:%M:%S')
            if locked_until > datetime.datetime.now():
                return api_response(False, f"Account locked. Try again after {locked_until}")

        if check_password(admin['password'], password):
            # Success
            token = secrets.token_hex(32)
            expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            cursor.execute("UPDATE admins SET token=?, token_expiry=?, failed_attempts=0, locked_until=NULL WHERE id=?", 
                           (token, expiry, admin['id']))
            
            resp, code = api_response(True, "Login successful", {"token": token})
            resp = make_response(resp)
            resp.set_cookie('admin_token', token, httponly=True, samesite='None', secure=True, max_age=24*3600)
            return resp
        else:
            # Fail logic
            attempts = admin['failed_attempts'] + 1
            if attempts >= 3:
                lockout = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
                cursor.execute("UPDATE admins SET failed_attempts=?, locked_until=? WHERE id=?", (attempts, lockout, admin['id']))
                return api_response(False, "Account locked for 1 hour due to too many failed attempts")
            else:
                cursor.execute("UPDATE admins SET failed_attempts=? WHERE id=?", (attempts, admin['id']))
                return api_response(False, f"Invalid credentials. Attempts remaining: {3 - attempts}")

@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return api_response(False, "Username and password are required")
        
    if ' ' in username or ' ' in password:
        return api_response(False, "Spaces are not allowed in credentials")

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, first_name, last_name, username, referral_code, referred_by, wallet_balance, has_purchased, fecto_id, avatar_path, created_at, email, phone, password, is_active, is_banned, ban_reason
                FROM users WHERE username = ?
            ''', (username,))
            user = cursor.fetchone()

            if user and user['is_active'] == 1 and check_password(user['password'], password):
                # Calculate commission rate
                commission_rate = 40 if user['has_purchased'] else 10
                
                # Monthly stats
                cursor.execute('''
                    SELECT COALESCE(SUM(amount), 0) FROM transactions 
                    WHERE user_id = ? AND type = 'commission' AND status = 'approved'
                    AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
                ''', (user['id'],))
                monthly_commission = cursor.fetchone()[0]

                user_data = {
                    "id": user['id'],
                    "first_name": user['first_name'],
                    "last_name": user['last_name'],
                    "username": user['username'],
                    "avatar_path": user['avatar_path'],
                    "created_at": user['created_at'],
                    "email": user['email'],
                    "phone": user['phone'],
                    "commission_rate": commission_rate,
                    "monthly_commission": monthly_commission,
                    "fecto_id": user['fecto_id'],
                    "referred_by_code": user['referred_by'],
                    "referral_code": user['referral_code'],
                    "has_purchased": user['has_purchased'],
                    "is_banned": bool(user['is_banned']),
                    "ban_reason": user['ban_reason'] or ''
                }

                # Fetch Referrer Username if exists
                ref_user = None
                if user['referred_by']:
                    cursor.execute("SELECT username FROM users WHERE referral_code = ?", (user['referred_by'],))
                    ref_user = cursor.fetchone()
                
                # Generate Token
                token = secrets.token_hex(32)
                expiry = datetime.datetime.utcnow() + datetime.timedelta(days=7)
                cursor.execute("UPDATE users SET token=?, token_expiry=? WHERE id=?", (token, expiry, user['id']))

                user_data['token'] = token 
                user_data['referrer_username'] = ref_user['username'] if ref_user else None

                resp, code = api_response(True, "Login successful", {"user": user_data})
                resp = make_response(resp)
                resp.set_cookie('token', token, httponly=True, samesite='None', secure=True, max_age=7*24*3600)
                return resp
            else:
                return api_response(False, "Invalid credentials")
    except Exception as e:
        return api_response(False, str(e))

@auth_bp.route('/api/check-account-status', methods=['POST'])
def check_account_status():
    data = request.json
    username = data.get('username')
    
    if not username:
        return api_response(False, "Username is required")

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Fetch is_active and email to determine recovery path
            cursor.execute('SELECT is_active, email FROM users WHERE username = ?', (username,))
            user = cursor.fetchone()
            
            if not user:
                return api_response(False, "User not found"), 404
            
            status = 'active' if user['is_active'] == 1 else 'inactive'
            has_email = bool(user['email'])
            
            return api_response(True, data={
                "status": status,
                "hasEmail": has_email,
                "email": user['email']
            })
    except Exception as e:
        return api_response(False, str(e))

@auth_bp.route('/api/upload-avatar', methods=['POST'])
@require_user_token
def upload_avatar():
    if 'avatar' not in request.files: return api_response(False, "No file")
    username = g.user['username'] # Secure from token
    file = request.files['avatar']
    
    if file and allowed_file(file.filename, {'png', 'jpg', 'jpeg', 'webp'}):
        filename = f"avatar_{username}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'avatars', filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        
        # Image compression logic could go here, but keeping it simple for modularity
        file.save(path)
        rel_path = f"uploads/avatars/{filename}"
        
        with get_db() as conn:
            conn.execute("UPDATE users SET avatar_path = ? WHERE username = ?", (rel_path, username))
            
        return api_response(True, data={"avatar_url": f"/{rel_path}"})
    return api_response(False, "Invalid file")

@auth_bp.route('/api/security/delete-account', methods=['POST'])
@require_user_token
def delete_account():
    data = request.json
    user_id = g.user['id'] # Secure
    password = data.get('password')

    if not password:
        return api_response(False, "Password required for deletion")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password, is_active FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        
        if not row or not check_password(row['password'], password):
            return api_response(False, "Invalid credentials")
            
        if not row['is_active']:
            return api_response(False, "Account inactive")

        # SOFT DELETE logic as requested
        cursor.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
        
    return api_response(True, "Account deactivated successfully")

@auth_bp.route('/api/security/change-password', methods=['POST'])
@require_user_token
def change_password():
    data = request.json
    user_id = g.user['id'] # Secure
    old_pass = data.get('old_password')
    new_pass = data.get('new_password')

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        
        if not row or not check_password(row['password'], old_pass):
            return api_response(False, "Invalid old password")

        if ' ' in new_pass:
            return api_response(False, "Spaces are not allowed in password")

        if len(new_pass) < 8:
            return api_response(False, "New password must be at least 8 characters")
        if len(new_pass) > 128:
            return api_response(False, "New password must be 128 characters or less")

        cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(new_pass), user_id))
        
    return api_response(True, "Password updated")

@auth_bp.route('/api/security/add-email', methods=['POST'])
@require_user_token
def add_email():
    data = request.json
    user_id = g.user['id'] # Secure
    email = data.get('email')

    if not email or not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return api_response(False, "Invalid email format")
    
    if len(email) > 50:
        return api_response(False, "Email too long (max 50)")

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if email exists for another user
        cursor.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user_id))
        if cursor.fetchone():
            return api_response(False, "Email already in use by another account")

        cursor.execute("UPDATE users SET email = ? WHERE id = ?", (email, user_id))
        
    return api_response(True, "Email updated")

@auth_bp.route('/logout', methods=['POST'])
def logout():
    resp, code = api_response(True, "Logged out")
    resp = make_response(resp)
    resp.set_cookie('token', '', expires=0, httponly=True, samesite='None', secure=True)
    return resp

@auth_bp.route('/admin/logout', methods=['POST'])
def admin_logout():
    resp, code = api_response(True, "Logged out")
    resp = make_response(resp)
    resp.set_cookie('admin_token', '', expires=0, httponly=True, samesite='None', secure=True)
    return resp

@auth_bp.route('/api/get_referrals', methods=['POST'])
@require_user_token
def get_referrals():
    data = request.json
    ref_code = g.user['referral_code'] # Secure
    user_id = g.user['id'] # Secure
    limit = data.get('limit', 10)
    offset = data.get('offset', 0)

    if not ref_code:
        return api_response(False, "Missing referral code")

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check total count
        cursor.execute('SELECT COUNT(*) FROM users WHERE referred_by = ?', (ref_code,))
        total_count = cursor.fetchone()[0]

        # Fetch chunk
        cursor.execute('SELECT first_name, last_name, username, created_at, id FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', (ref_code, limit, offset))
        referred = cursor.fetchall()
        
        referral_list = []
        for r in referred:
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type='commission' AND referred_user_id = ?", (user_id, r['id']))
            earned = cursor.fetchone()[0] or 0
            referral_list.append({
                "username": r['username'],
                "full_name": f"{r['first_name']} {r['last_name']}",
                "joined_at": r['created_at'],
                "earned": earned
            })

    has_more = (offset + limit) < total_count
    return api_response(True, data={"referral_list": referral_list, "has_more": has_more})

@auth_bp.route('/api/add_referrer', methods=['POST'])
@require_user_token
def add_referrer():
    data = request.json
    user_id = g.user['id'] # Secure
    referral_code = data.get('referral_code')

    if not referral_code:
        return api_response(False, "Missing required fields")

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check User
        cursor.execute("SELECT id, referred_by, referral_code FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            return api_response(False, "User not found")
            
        if user['referred_by']:
            return api_response(False, "You already have a referrer")
            
        if user['referral_code'] == referral_code:
            return api_response(False, "You cannot refer yourself")

        # Check Code Validity
        cursor.execute("SELECT id FROM users WHERE referral_code = ?", (referral_code,))
        referrer = cursor.fetchone()
        if not referrer:
            return api_response(False, "Invalid referral code")
            
        # Update
        cursor.execute("UPDATE users SET referred_by = ? WHERE id = ?", (referral_code, user_id))
        conn.commit()
        
        return api_response(True, "Referrer added successfully")

# ==========================================
# WALLET & TRANSACTIONS
# ==========================================

@wallet_bp.route('/api/refresh_stats', methods=['POST'])
@wallet_bp.route('/user/stats', methods=['POST'])
@require_user_token
def refresh_stats():
    user_id = g.user['id'] # Secure

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT wallet_balance, has_purchased, referral_code, fecto_id, avatar_path, username, first_name, last_name, email, phone, created_at, referred_by, is_active, is_banned, ban_reason FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        
        if not user_row: 
            return api_response(False, "User not found")
            
        if not user_row['is_active']:
            return api_response(False, "User account inactive")

        cursor.execute("SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='commission' AND status='approved' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')", (user_id,))
        monthly = cursor.fetchone()[0] or 0
        
        # Get Referral Stats efficiently
        # 1. Total Count
        cursor.execute('SELECT COUNT(*) FROM users WHERE referred_by = ?', (user_row['referral_code'],))
        total_referrals = cursor.fetchone()[0]

        # 2. Total Earned (All commissions)
        cursor.execute("SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='commission' AND status='approved'", (user_id,))
        total_earned = cursor.fetchone()[0] or 0

        # 3. Initial List (Top 10)
        cursor.execute('SELECT first_name, last_name, username, created_at, id FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 10', (user_row['referral_code'],))
        referred = cursor.fetchall()
        
        referral_list = []
        for r in referred:
            # Individual earnings per referral now use the professional referred_user_id column
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type='commission' AND referred_user_id = ?", (user_id, r['id']))
            earned = cursor.fetchone()[0] or 0
            referral_list.append({
                "username": r['username'],
                "full_name": f"{r['first_name']} {r['last_name']}",
                "joined_at": r['created_at'],
                "earned": earned
            })

        stats = {
            "wallet_balance": user_row['wallet_balance'],
            "has_purchased": bool(user_row['has_purchased']),
            "referral_code": user_row['referral_code'],
            "monthly_commission": monthly,
            "fecto_id": user_row['fecto_id'],
            "avatar_path": user_row['avatar_path'],
            "username": user_row['username'],
            "first_name": user_row['first_name'],
            "last_name": user_row['last_name'],
            "email": user_row['email'],
            "phone": user_row['phone'],
            "created_at": user_row['created_at'],
            "total_referrals": total_referrals,
            "commission_rate": 40 if user_row['has_purchased'] else 10,
            "referral_list": referral_list,
            "has_more_referrals": total_referrals > 10,
            "total_referrals_earned": total_earned,
            "referred_by_code": user_row['referred_by'],
            "is_banned": bool(user_row['is_banned']),
            "ban_reason": user_row['ban_reason'] or ''
        }
        
        # Fetch referrer username using the stored code
        if user_row['referred_by']:
            cursor.execute("SELECT username FROM users WHERE referral_code = ?", (user_row['referred_by'],))
            ref_user = cursor.fetchone()
            if ref_user:
                stats['referrer_username'] = ref_user['username']

    return api_response(True, data={"stats": stats})

@wallet_bp.route('/user/transactions', methods=['POST'])
@require_user_token
def get_transactions():
    data = request.json
    user_id = g.user['id']
    limit = data.get('limit', 20)
    offset = data.get('offset', 0)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, limit, offset))
        txns = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"transactions": txns})

@wallet_bp.route('/submit_purchase', methods=['POST'])
@require_user_token
def submit_purchase():
    data = request.json
    uid = g.user['id'] # Secure ID
    
    # Validation
    desc = data.get('description', '')
    if desc and len(desc) > 500:
        return api_response(False, "Description too long")

    try:
        with get_db() as conn:
            # Verify user exists first (Already done by decorator: g.user)
            public_id = data.get('public_id') or generate_random_id(8, "TXN-")
            conn.execute('''
                INSERT INTO transactions (user_id, course_id, type, amount, status, description, screenshot_path, public_id, account_title, target_account)
                VALUES (?, ?, 'purchase', ?, 'pending', ?, ?, ?, ?, ?)
            ''', (uid, data['course_id'], data['amount'], data.get('description'), data.get('screenshot_path'), public_id, data.get('account_title'), data.get('target_account')))
        return api_response(True, "Purchase submitted")
    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed: transactions.public_id" in str(e):
            return api_response(False, "Transaction ID already used. Please provide a unique TrxID.", status=400)
        return api_response(False, f"Database error: {str(e)}", status=500)
    except Exception as e:
        return api_response(False, str(e), status=500)

@wallet_bp.route('/request_withdrawal', methods=['POST'])
@require_user_token
def request_withdrawal():
    data = request.json
    user_id = g.user['id']
    amount = float(data['amount'])

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT wallet_balance FROM users WHERE id = ?", (user_id,))
            bal = cursor.fetchone()['wallet_balance']
            if bal < amount: return api_response(False, "Insufficient funds")

            public_id = generate_random_id(8, "WD-")
            conn.execute("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?", (amount, user_id))
            conn.execute('''
                INSERT INTO transactions (user_id, type, amount, status, description, target_account, public_id, 
                                          withdrawal_method, account_title, bank_name)
                VALUES (?, 'withdrawal', ?, 'pending', ?, ?, ?, ?, ?, ?)
            ''', (user_id, amount, 
                  f"{data['method']} withdrawal to {data['account_number']}", 
                  data['account_number'], 
                  public_id,
                  data['method'],
                  data.get('account_title', ''),
                  data.get('bank_name', '')))
        return api_response(True, "Withdrawal submitted")
    except sqlite3.IntegrityError as e:
        return api_response(False, "Transaction conflict. Please try again.", status=400)
    except Exception as e:
        return api_response(False, str(e), status=500)

# ==========================================
# ADMIN ROUTES
# ==========================================

@admin_bp.route('/admin/pending', methods=['GET'])
@require_admin
def get_pending():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT t.*, u.username, u.fecto_id, c.title as course_title
            FROM transactions t 
            JOIN users u ON t.user_id = u.id 
            LEFT JOIN courses c ON t.course_id = c.id
            WHERE t.status = 'pending'
        ''')
        res = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"transactions": res})

@admin_bp.route('/admin/users', methods=['GET'])
@require_admin
def get_all_users():
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.first_name, u.last_name, u.username, u.phone, u.email, 
                   u.referral_code, u.referred_by, u.wallet_balance, u.has_purchased, 
                   u.is_active, u.fecto_id, u.avatar_path, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', u.created_at) as created_at,
                   strftime('%Y-%m-%dT%H:%M:%SZ', u.last_seen) as last_seen,
                   GROUP_CONCAT(c.title, ', ') as purchased_courses
            FROM users u
            LEFT JOIN user_courses uc ON u.id = uc.user_id
            LEFT JOIN courses c ON uc.course_id = c.id
            GROUP BY u.id
            ORDER BY u.created_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        users = [dict(row) for row in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) FROM users")
        total_count = cursor.fetchone()[0]

    return api_response(True, data={"users": users, "total_count": total_count})

@admin_bp.route('/admin/all-transactions', methods=['GET'])
@require_admin
def get_all_transactions():
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT t.*, u.username, u.fecto_id, c.title as course_title,
                   strftime('%Y-%m-%dT%H:%M:%SZ', t.created_at) as created_at
            FROM transactions t 
            JOIN users u ON t.user_id = u.id 
            LEFT JOIN courses c ON t.course_id = c.id
            ORDER BY t.created_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        txns = [dict(row) for row in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) FROM transactions")
        total_count = cursor.fetchone()[0]

    return api_response(True, data={"transactions": txns, "total_count": total_count})

@admin_bp.route('/admin/online_users', methods=['GET'])
@require_admin
def get_online_users():
    # Active in the last 5 minutes
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, first_name, last_name, username, fecto_id, phone, 
                   strftime('%Y-%m-%dT%H:%M:%SZ', last_seen) as last_seen, 
                   has_purchased
            FROM users 
            WHERE last_seen >= datetime('now', '-90 seconds')
            ORDER BY last_seen DESC
        ''')
        users = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"users": users})

@admin_bp.route('/admin/broadcast-notification', methods=['POST'])
@require_admin
def broadcast_notification():
    data = request.json
    title = data.get('title', 'System Update')
    message = data.get('message')
    notif_type = data.get('type', 'info') # info, success, warning
    
    if not message:
        return api_response(False, "Message content is required")
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE is_active = 1")
        user_ids = [row[0] for row in cursor.fetchall()]
        
        for uid in user_ids:
            conn.execute('''
                INSERT INTO notifications (user_id, type, title, message)
                VALUES (?, ?, ?, ?)
            ''', (uid, notif_type, title, message))
            
    return api_response(True, f"Broadcast sent to {len(user_ids)} users")
    
@admin_bp.route('/admin/send-direct-notification', methods=['POST'])
@require_admin
def send_direct_notification():
    data = request.json
    uid = data.get('user_id')
    fecto_id = data.get('fecto_id')
    username = data.get('username')
    title = data.get('title', 'Notification')
    message = data.get('message')
    notif_type = data.get('type', 'info') # info, success, warning
    
    if not message:
        return api_response(False, "Message content is required")
        
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Priority: UID > Username > FectoID
        if not uid:
            if username:
                cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                user = cursor.fetchone()
                if not user: return api_response(False, "User not found with that Username")
                uid = user['id']
            elif fecto_id:
                cursor.execute("SELECT id FROM users WHERE fecto_id = ?", (fecto_id,))
                user = cursor.fetchone()
                if not user: return api_response(False, "User not found with that Fecto ID")
                uid = user['id']
            
        if not uid:
            return api_response(False, "User identifier is required")
            
        conn.execute('''
            INSERT INTO notifications (user_id, type, title, message)
            VALUES (?, ?, ?, ?)
        ''', (uid, notif_type, title, message))
        
    return api_response(True, "Notification sent to user successfully")

@admin_bp.route('/admin/approve', methods=['POST'])
@require_admin
def approve():
    tid = request.json.get('transaction_id')
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions WHERE id = ? AND status = "pending"', (tid,))
        txn = cursor.fetchone()
        if not txn: return api_response(False, "Not found")

        uid = txn['user_id']
        if txn['type'] == 'purchase':
            conn.execute('UPDATE users SET has_purchased = 1 WHERE id = ?', (uid,))
            if txn['course_id']:
                conn.execute('INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)', (uid, txn['course_id']))
            
            # Commission logic
            cursor.execute('SELECT referred_by FROM users WHERE id = ?', (uid,))
            ref_code = cursor.fetchone()[0]
            if ref_code:
                cursor.execute('SELECT id, has_purchased, fecto_id FROM users WHERE referral_code = ?', (ref_code,))
                referrer = cursor.fetchone()
                if referrer:
                    # Get the referred user's fecto_id for the description
                    cursor.execute('SELECT fecto_id FROM users WHERE id = ?', (uid,))
                    referred_user_fecto = cursor.fetchone()
                    referred_fecto_id = referred_user_fecto['fecto_id'] if referred_user_fecto else f"ID-{uid}"
                    
                    rate = 0.4 if referrer['has_purchased'] else 0.1
                    comm = txn['amount'] * rate
                    conn.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', (comm, referrer['id']))
                    conn.execute('INSERT INTO transactions (user_id, type, amount, status, description, public_id, referred_user_id) VALUES (?, "commission", ?, "approved", ?, ?, ?)',
                                (referrer['id'], comm, f"Commission from {referred_fecto_id}", generate_random_id(8, "COM-"), uid))

        conn.execute('UPDATE transactions SET status = "approved", approved_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
        send_notification(uid, 'success', 'Approved', f"Your {txn['type']} for Rs.{txn['amount']} has been approved.", conn)
        
    return api_response(True, "Approved")

@admin_bp.route('/admin/reject', methods=['POST'])
@require_admin
def reject_transaction():
    tid = request.json.get('transaction_id')
    reason = request.json.get('reason', 'Payment not received')
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions WHERE id = ? AND status = "pending"', (tid,))
        txn = cursor.fetchone()
        if not txn: return api_response(False, "Not found")

        uid = txn['user_id']
        
        # If withdrawal is rejected, refund the amount to user's wallet
        if txn['type'] == 'withdrawal':
            conn.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', (txn['amount'], uid))
        
        conn.execute('''
            UPDATE transactions 
            SET status = "rejected", rejection_reason = ? 
            WHERE id = ?
        ''', (reason, tid))
        
        # Notify user
        if txn['type'] == 'withdrawal':
            msg = f"Your withdrawal for Rs.{txn['amount']} was rejected: {reason}. The amount has been refunded to your wallet."
        else:
            msg = f"Your {txn['type']} for Rs.{txn['amount']} failed: {reason}. If you think this is a mistake, you can send the request again."
        send_notification(uid, 'warning', 'Transaction Failed', msg, conn)
        
    return api_response(True, "Rejected")

@admin_bp.route('/admin/user-info', methods=['GET'])
@require_admin
def get_user_info():
    username = request.args.get('username')
    if not username:
        return api_response(False, "Username required")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, phone, is_active FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        
    if not user:
        return api_response(False, "User not found")
        
    return api_response(True, data={"user": dict(user)})

@admin_bp.route('/admin/reset-password', methods=['POST'])
@require_admin
def reset_password():
    data = request.json
    uid = data.get('user_id')
    new_pass = data.get('new_password')
    
    if not uid or not new_pass:
        return api_response(False, "Missing fields")
        
    if ' ' in new_pass:
        return api_response(False, "Spaces are not allowed in password")
        
    if len(new_pass) < 8:
        return api_response(False, "Password must be at least 8 characters long")
    if len(new_pass) > 128:
        return api_response(False, "Password must be 128 characters or less")
        
    with get_db() as conn:
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(new_pass), uid))
        # Clear any 'inactive' status if they were deactivated
        conn.execute("UPDATE users SET is_active = 1 WHERE id = ?", (uid,))
        
    return api_response(True, "Password updated successfully")

@admin_bp.route('/admin/feedback', methods=['GET'])
@require_admin
def get_all_feedback():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM feedback ORDER BY created_at DESC')
        res = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"feedback": res})

@admin_bp.route('/admin/chats', methods=['GET'])
@require_admin
def get_admin_chats():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT user_id, username, session_id, message, created_at, sender_type FROM support_chats
            WHERE id IN (SELECT MAX(id) FROM support_chats GROUP BY user_id, username, session_id)
            ORDER BY created_at DESC
        ''')
        res = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"chats": res})

@admin_bp.route('/admin/ban-user', methods=['POST'])
@require_admin
def ban_user_route():
    data = request.json
    uid = data.get('user_id')
    username = data.get('username')
    reason = data.get('reason', 'Violation of terms')
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Resolve UID if only Username provided
        if not uid and username:
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()
            if not user: return api_response(False, "User not found")
            uid = user['id']
            
        if not uid:
             return api_response(False, "User ID or Username required")
             
        conn.execute("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?", (reason, uid))
        
        # Expire tokens immediately to force re-login/check
        # Actually user said "can login but see banned card". Tokens are checked in require_user_token.
        # So we don't necessarily need to expire, but we might want to so they get the updated state immediately.
        # But front end polls or checks state. Let's just update DB.
        
    return api_response(True, "User banned successfully")

@admin_bp.route('/admin/unban-user', methods=['POST'])
@require_admin
def unban_user_route():
    data = request.json
    uid = data.get('user_id')
    
    if not uid: return api_response(False, "User ID required")
    
    with get_db() as conn:
        conn.execute("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?", (uid,))
        
    return api_response(True, "User unbanned successfully")

@admin_bp.route('/admin/banned-users', methods=['GET'])
@require_admin
def get_banned_users():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, first_name, last_name, phone, ban_reason, created_at FROM users WHERE is_banned = 1")
        res = [dict(row) for row in cursor.fetchall()]
    return api_response(True, data={"users": res})
    return api_response(True, data={"chats": res})

# ==========================================
# SUPPORT & FEEDBACK
# ==========================================

@support_bp.route('/api/send_message', methods=['POST'])
def send_message():
    data = request.json
    msg = data.get('message', '')
    if not msg: return api_response(False, "Empty message")
    if len(msg) > 500: return api_response(False, "Message too long")

    stype = data.get('sender_type', 'user')
    sid = data.get('session_id')
    if sid in ['null', 'undefined', '']: sid = None
    
    # --- AUTHENTICATION & TARGETING ---
    admin_token = request.cookies.get('admin_token') or request.headers.get('x-admin-token')
    user_token = request.cookies.get('token') or request.headers.get('x-auth-token')
    
    uid = data.get('user_id', 0)
    username = data.get('username', 'Guest')
    is_admin = False
    
    # Only check admin auth if sender explicitly claims to be admin
    if stype == 'admin':
        if not admin_token:
            return api_response(False, "Missing admin token", status=401)
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM admins WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP", (admin_token,))
            if cursor.fetchone():
                is_admin = True
            else:
                return api_response(False, "Invalid or expired admin token", status=401)
    
    # Check User Auth (if not admin or if we want to identify a specific student)
    if not is_admin and user_token:
        with get_db() as conn:
            cursor = conn.cursor()
            # Note: We allow banned users (is_banned=1) to use support chat
            cursor.execute("SELECT id, username FROM users WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP AND is_active = 1", (user_token,))
            user = cursor.fetchone()
            if user:
                uid = user['id']
                username = user['username']
                # Logged-in students shouldn't use session_ids
                sid = None

    with get_db() as conn:
        conn.execute('INSERT INTO support_chats (user_id, username, session_id, message, sender_type) VALUES (?, ?, ?, ?, ?)',
                     (uid, username, sid, msg, stype))
        if stype == 'admin' and uid != 0:
            send_notification(uid, 'chat', 'Support Message', msg[:50], conn)
    return api_response(True, "Message sent")

@support_bp.route('/api/chat/history', methods=['GET'])
def chat_history():
    # Priority: Cookie > Header
    token = request.cookies.get('token') or request.headers.get('x-auth-token')
    admin_token = request.cookies.get('admin_token') or request.headers.get('x-admin-token')
    user_id = 0
    
    # Check if this request is coming from an admin
    is_admin = False
    if admin_token:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM admins WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP", (admin_token,))
            if cursor.fetchone():
                is_admin = True

    if not is_admin and token:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE token = ? AND token_expiry > CURRENT_TIMESTAMP AND is_active = 1", (token,))
            user = cursor.fetchone()
            if user:
                user_id = user['id']
        
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    username = request.args.get('username')
    sid = request.args.get('session_id')
    if sid in ['null', 'undefined', '']: sid = None
    
    # Security: If user is logged in, they CANNOT view other session/username histories
    if user_id != 0:
        sid = None
        username = None

    with get_db() as conn:
        cursor = conn.cursor()
        if sid and username:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND session_id = ? AND username = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, sid, username, limit, offset))
        elif sid:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, sid, limit, offset))
        elif user_id == 0 and username:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND username = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, username, limit, offset))
        else:
            # For logged in users (uid != 0), this is the main path
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, limit, offset))
            
        history = [dict(row) for row in cursor.fetchall()]
        history.reverse()

        # Update read status
        if sid and username:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND session_id = ? AND username = ? AND sender_type='admin'", (user_id, sid, username))
        elif sid:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND session_id = ? AND sender_type='admin'", (user_id, sid))
        elif user_id == 0 and username:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND username = ? AND sender_type='admin'", (user_id, username))
        else:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND sender_type='admin'", (user_id,))
            
    return api_response(True, data={"history": history})

@support_bp.route('/admin/chat/<int:user_id>', methods=['GET'])
@require_admin
def get_admin_chat_history(user_id):
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    username = request.args.get('username')
    sid = request.args.get('session_id')
    if sid in ['null', 'undefined', '']: sid = None
    
    with get_db() as conn:
        cursor = conn.cursor()
        if sid and username:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND session_id = ? AND username = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, sid, username, limit, offset))
        elif sid:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, sid, limit, offset))
        elif user_id == 0 and username:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? AND username = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, username, limit, offset))
        else:
            cursor.execute("SELECT * FROM support_chats WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, limit, offset))
            
        history = [dict(row) for row in cursor.fetchall()]
        history.reverse()

        # Admin reads User messages
        if sid and username:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND session_id = ? AND username = ? AND sender_type='user'", (user_id, sid, username))
        elif sid:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND session_id = ? AND sender_type='user'", (user_id, sid))
        elif user_id == 0 and username:
            # Guest
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND username = ? AND sender_type='user'", (user_id, username))
        else:
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND sender_type='user'", (user_id,))
            
    return api_response(True, data={"history": history})

@support_bp.route('/api/chat/unread_count', methods=['GET'])
@require_user_token
def unread_count():
    user_id = g.user['id']
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM support_chats WHERE user_id=? AND sender_type="admin" AND is_read=0', (user_id,))
        count = cursor.fetchone()[0]
    return api_response(True, data={"count": count})

@support_bp.route('/api/submit_feedback', methods=['POST'])
@require_user_token
def submit_feedback():
    data = request.json
    with get_db() as conn:
        conn.execute('INSERT INTO feedback (user_id, username, message) VALUES (?, ?, ?)',
                    (g.user['id'], g.user['username'], data['message']))
    return api_response(True, "Feedback received")

# ==========================================
# NOTIFICATIONS
# ==========================================

@notif_bp.route('/api/notifications', methods=['GET'])
@require_user_token
def get_notifications():
    user_id = g.user['id']
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    with get_db() as conn:
        cursor = conn.cursor()
        # Fetch actual notifications with pagination
        cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (user_id, limit, offset))
        notifs = [dict(row) for row in cursor.fetchall()]
        
        # Merge recent chat messages (only on first load)
        chats = []
        if offset == 0:
            cursor.execute("SELECT id, 'chat' as type, 'Support' as title, message, created_at, is_read FROM support_chats WHERE user_id=? AND sender_type='admin' ORDER BY created_at DESC LIMIT 5", (user_id,))
            chats = [dict(row) for row in cursor.fetchall()]
            # Prefix chat IDs to distinguish them from system notifications
            for c in chats:
                c['id'] = f"chat-{c['id']}"
        
        merged = notifs + chats
        merged.sort(key=lambda x: str(x['created_at']), reverse=True)
        
    return api_response(True, data={"notifications": merged})

@notif_bp.route('/api/notifications/mark_read', methods=['POST'])
@require_user_token
def mark_read():
    uid = g.user['id']
    nid = request.json.get('notification_id')
    with get_db() as conn:
        if nid:
            if isinstance(nid, str) and nid.startswith('chat-'):
                # Mark specific support chat as read
                cid = nid.split('-')[1]
                conn.execute("UPDATE support_chats SET is_read = 1 WHERE id = ? AND user_id = ?", (cid, uid))
            else:
                # Mark specific system notification as read
                conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (nid, uid))
        else: 
            # Mark ALL as read
            conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (uid,))
            conn.execute("UPDATE support_chats SET is_read = 1 WHERE user_id = ? AND sender_type='admin'", (uid,))
    return api_response(True)

# ==========================================
# COURSE CONTENT & PROGRESS
# ==========================================

@util_bp.route('/api/courses', methods=['GET'])
@require_user_token
def get_courses():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM courses")
        courses = [dict(row) for row in cursor.fetchall()]
        
        # Rename image_url to image for frontend compatibility if needed
        for c in courses:
            c['image'] = c.get('image_url')
            
    return api_response(True, data={"courses": courses})

@util_bp.route('/api/progress/sync', methods=['POST'])
@require_user_token
def sync_progress():
    data = request.json
    uid = g.user['id']
    course_id = data.get('course_id')
    class_id = data.get('class_id')
    
    if not course_id or class_id is None:
        return api_response(False, "Missing course or class ID")
        
    try:
        with get_db() as conn:
            conn.execute('''
                INSERT OR IGNORE INTO user_progress (user_id, course_id, class_id)
                VALUES (?, ?, ?)
            ''', (uid, course_id, class_id))
        return api_response(True, "Progress synced")
    except Exception as e:
        return api_response(False, str(e))

@util_bp.route('/api/progress/get', methods=['GET'])
@require_user_token
def get_progress():
    uid = g.user['id']
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT course_id, class_id FROM user_progress WHERE user_id = ?", (uid,))
        rows = cursor.fetchall()
        
        progress = {}
        for row in rows:
            cid = str(row['course_id'])
            if cid not in progress:
                progress[cid] = []
            progress[cid].append(row['class_id'])
            
    return api_response(True, data={"progress": progress})

    return api_response(True, data={"classes": classes})

@util_bp.route('/api/course/<int:course_id>/full', methods=['GET'])
@require_user_token
def get_full_course(course_id):
    """Returns the entire course structure including classes and steps with answers."""
    import json
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Fetch Course metadata
        cursor.execute("SELECT * FROM courses WHERE id = ?", (course_id,))
        course = cursor.fetchone()
        if not course: return api_response(False, "Course not found")
        course_data = dict(course)
        
        # 2. Fetch all classes for this course
        cursor.execute("SELECT * FROM course_classes WHERE course_id = ? ORDER BY class_order ASC", (course_id,))
        classes = [dict(row) for row in cursor.fetchall()]
        
        # 3. For each class, fetch all steps
        for c in classes:
            cursor.execute("SELECT id, step_order, type, title, content_json, xp_reward FROM class_steps WHERE class_id = ? ORDER BY step_order ASC", (c['id'],))
            steps = [dict(row) for row in cursor.fetchall()]
            for s in steps:
                s['content'] = json.loads(s['content_json'])
                # NOTE: We are NOT popping 'answer' anymore so frontend can validate
            c['steps'] = steps
            c['is_unlocked'] = True # Standard logic for now
            
        course_data['classes'] = classes
        
    return api_response(True, data={"course": course_data})

@util_bp.route('/api/class/<int:class_id>/steps', methods=['GET'])
@require_user_token
def get_class_steps(class_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, step_order, type, title, content_json, xp_reward FROM class_steps WHERE class_id = ? ORDER BY step_order ASC", (class_id,))
        steps = [dict(row) for row in cursor.fetchall()]
        # Parse JSON content for each step
        import json
        for s in steps:
            s['content'] = json.loads(s['content_json'])
            # Answer is now intentionally included for frontend validation
            
    return api_response(True, data={"steps": steps})

@util_bp.route('/api/step/validate', methods=['POST'])
@require_user_token
def validate_step():
    data = request.json
    step_id = data.get('step_id')
    user_answer = data.get('answer', '').strip()
    user_id = g.user['id']

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM class_steps WHERE id = ?", (step_id,))
            step = cursor.fetchone()
            if not step: return api_response(False, "Step not found")

            import json
            content = json.loads(step['content_json'])
            correct_answer = str(content.get('answer', '')).strip()

            is_correct = True
            if step['type'] in ['quiz', 'input', 'code']:
                is_correct = (user_answer.lower() == correct_answer.lower())

            if is_correct:
                # Update Progress
                class_id = step['class_id']
                # Get Course ID
                cursor.execute("SELECT course_id FROM course_classes WHERE id = ?", (class_id,))
                course_id = cursor.fetchone()[0]

                # Upsert user progress
                cursor.execute('''
                    INSERT INTO user_progress (user_id, course_id, completed_class_id, completed_step_id, total_xp)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, course_id) DO UPDATE SET
                    completed_class_id = excluded.completed_class_id,
                    completed_step_id = excluded.completed_step_id,
                    total_xp = total_xp + excluded.total_xp,
                    last_accessed = CURRENT_TIMESTAMP
                ''', (user_id, course_id, class_id, step_id, step['xp_reward']))
                
                return api_response(True, "Correct!", data={"is_correct": True})
            else:
                return api_response(True, "Incorrect answer, try again.", data={"is_correct": False})
    except Exception as e:
        return api_response(False, f"Validation Error: {str(e)}", status=500)

@util_bp.route('/api/step/record_progress', methods=['POST'])
@require_user_token
def record_progress():
    """Records step completion and awards XP without re-validating the answer."""
    data = request.json
    step_id = data.get('step_id')
    user_id = g.user['id']

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT class_id, xp_reward FROM class_steps WHERE id = ?", (step_id,))
            step = cursor.fetchone()
            if not step: return api_response(False, "Step not found")

            class_id = step['class_id']
            # Get Course ID
            cursor.execute("SELECT course_id FROM course_classes WHERE id = ?", (class_id,))
            course_id = cursor.fetchone()[0]

            # Upsert user progress
            cursor.execute('''
                INSERT INTO user_progress (user_id, course_id, completed_class_id, completed_step_id, total_xp)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, course_id) DO UPDATE SET
                completed_class_id = excluded.completed_class_id,
                completed_step_id = excluded.completed_step_id,
                total_xp = total_xp + excluded.total_xp,
                last_accessed = CURRENT_TIMESTAMP
            ''', (user_id, course_id, class_id, step_id, step['xp_reward']))
            
            return api_response(True, "Progress recorded")
    except Exception as e:
        return api_response(False, f"Progress Error: {str(e)}", status=500)

@util_bp.route('/api/course/batch_progress', methods=['POST'])
@require_user_token
def batch_progress():
    """Records multiple steps and total XP at once."""
    data = request.json
    course_id = data.get('course_id')
    class_id = data.get('class_id')
    step_ids = data.get('step_ids', [])
    total_xp_gain = data.get('xp_gain', 0)
    user_id = g.user['id']

    if not course_id or not class_id or not step_ids:
        return api_response(False, "Missing required fields")

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Record last step as the current progress marker
            last_step_id = step_ids[-1]
            
            # Upsert user progress
            cursor.execute('''
                INSERT INTO user_progress (user_id, course_id, completed_class_id, completed_step_id, total_xp)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, course_id) DO UPDATE SET
                completed_class_id = excluded.completed_class_id,
                completed_step_id = excluded.completed_step_id,
                total_xp = total_xp + excluded.total_xp,
                last_accessed = CURRENT_TIMESTAMP
            ''', (user_id, course_id, class_id, last_step_id, total_xp_gain))
            
            return api_response(True, "Batch progress synchronized")
    except Exception as e:
        return api_response(False, f"Batch Progress Error: {str(e)}", status=500)

@util_bp.route('/api/user/progress/<int:course_id>', methods=['GET'])
@require_user_token
def get_user_course_progress(course_id):
    user_id = g.user['id']
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user_progress WHERE user_id = ? AND course_id = ?", (user_id, course_id))
        res = cursor.fetchone()
    return api_response(True, data={"progress": dict(res) if res else None})

# ==========================================
# UTILS & UPOADS
# ==========================================

@util_bp.route('/upload_screenshot', methods=['POST'])
@require_user_token
def upload_screenshot():
    if 'file' not in request.files: return api_response(False, "No file")
    file = request.files['file']
    if file and allowed_file(file.filename, {'png', 'jpg', 'jpeg', 'gif', 'webp'}):
        ext = file.filename.rsplit('.', 1)[1].lower()
        # Use secure username in filename
        username = g.user['username']
        filename = f"screenshot_{username}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(path)
        return api_response(True, data={"path": f"uploads/{filename}"})
    return api_response(False, "Invalid file type")

@util_bp.route('/uploads/<path:filename>')
@util_bp.route('/uploads/avatars/<path:filename>')
def serve_upload(filename):
    # Handle both base uploads and avatar subfolder
    if 'avatars/' in request.path:
        return send_from_directory(os.path.join(current_app.config['UPLOAD_FOLDER'], 'avatars'), filename)
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)
