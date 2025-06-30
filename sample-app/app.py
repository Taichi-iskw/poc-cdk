from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return (
        jsonify(
            {
                "status": "healthy",
                "environment": os.getenv("ENVIRONMENT", "unknown"),
                "service": "spa-api",
            }
        ),
        200,
    )


@app.route("/api/user", methods=["GET"])
def get_user_info():
    """Get user information from Cognito claims"""
    # Get user info from ALB headers (set by Cognito authentication)
    user_info = {
        "username": request.headers.get("X-Amzn-Oidc-Identity", "unknown"),
        "email": request.headers.get("X-Amzn-Oidc-Attr-Email", "unknown"),
        "name": request.headers.get("X-Amzn-Oidc-Attr-Name", "unknown"),
        "groups": (
            request.headers.get("X-Amzn-Oidc-Attr-Groups", "").split(",")
            if request.headers.get("X-Amzn-Oidc-Attr-Groups")
            else []
        ),
    }

    logger.info(f"User info request: {user_info}")

    return (
        jsonify(
            {"user": user_info, "message": "User information retrieved successfully"}
        ),
        200,
    )


@app.route("/api/data", methods=["GET"])
def get_data():
    """Get sample data"""
    return (
        jsonify(
            {
                "data": [
                    {"id": 1, "name": "Item 1", "description": "First item"},
                    {"id": 2, "name": "Item 2", "description": "Second item"},
                    {"id": 3, "name": "Item 3", "description": "Third item"},
                ],
                "message": "Data retrieved successfully",
            }
        ),
        200,
    )


@app.route("/api/data/<int:item_id>", methods=["GET"])
def get_data_item(item_id):
    """Get specific data item"""
    items = {
        1: {"id": 1, "name": "Item 1", "description": "First item"},
        2: {"id": 2, "name": "Item 2", "description": "Second item"},
        3: {"id": 3, "name": "Item 3", "description": "Third item"},
    }

    if item_id in items:
        return (
            jsonify({"data": items[item_id], "message": "Item retrieved successfully"}),
            200,
        )
    else:
        return jsonify({"error": "Item not found"}), 404


@app.route("/api/echo", methods=["POST"])
def echo():
    """Echo back the request data"""
    data = request.get_json()
    return jsonify({"echo": data, "message": "Data echoed back successfully"}), 200


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
