// app.js
import Modal from './design-system/components/modal/modal.js';

let websocket = null;
let messageModal = null;

// Show an incoming server/WebSocket message using the design-system Modal.
function showMessage(message) {
  const body = document.createElement('p');
  body.className = 'body-medium';
  body.textContent = message;

  if (!messageModal) {
    messageModal = new Modal({
      size: 'small',
      title: 'Message',
      content: body,
      footerButtons: [{ label: 'Close', type: 'primary' }],
    });
  } else {
    messageModal.updateContent(body);
  }

  messageModal.open();
}

// Initialize WebSocket connection
function initializeWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws`;

  try {
    websocket = new WebSocket(wsUrl);

    websocket.onopen = function(event) {
      console.log('WebSocket connected');
    };

    websocket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.message) {
          showMessage(data.message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = function(event) {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        initializeWebSocket();
      }, 3000);
    };

    websocket.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWebSocket);
} else {
  initializeWebSocket();
}
