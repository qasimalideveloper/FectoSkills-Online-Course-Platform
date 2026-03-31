from flask import Flask
from flask_cors import CORS
import os
from database import init_db
from extensions import limiter
from routes import auth_bp, wallet_bp, admin_bp, support_bp, notif_bp, util_bp

def create_app():
    # Base directory (Absolute)
    base_dir = os.path.abspath(os.path.dirname(__file__))
    
    app = Flask(__name__)
    app.secret_key = os.environ.get('SECRET_KEY', 'dev-key-123-change-me') # Production should set this env var
    # CORS Configuration - Whitelisting production domains only
    CORS(app, supports_credentials=True, origins=[
        "https://fectoskills.netlify.app",
        "https://fectocashier.netlify.app",
    ]) 
    limiter.init_app(app)
    
    # Configuration
    UPLOAD_FOLDER = os.path.join(base_dir, "uploads")
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB to accommodate 20MB file
    
    # Ensure folders exist
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_FOLDER, "avatars"), exist_ok=True)
    
    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(wallet_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(notif_bp)
    app.register_blueprint(util_bp)

    @app.route('/')
    def health_check():
        return {"status": "Backend is running", "api_url": "https://fectoskills.pythonanywhere.com"}
    
    @app.errorhandler(500)
    def handle_500(e):
        import traceback
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}, 500

    return app

app = create_app()

# Initialize DB on startup
init_db()

if __name__ == '__main__':
    # Run server
    app.run(debug=False, host='0.0.0.0', port=5000)
