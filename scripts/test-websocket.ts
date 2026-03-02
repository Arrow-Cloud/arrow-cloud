/**
 * Test script for WebSocket connection
 *
 * This script provides example code for testing WebSocket connections.
 * Since Node.js doesn't have WebSocket built-in, install 'ws' package to use this script:
 *
 *   npm install --save-dev ws @types/ws
 *   tsx scripts/test-websocket.ts [websocket-url] [jwt-token]
 *
 * Or use this example code in your browser console:
 *
 * const wsUrl = 'wss://your-api.execute-api.us-east-2.amazonaws.com/prod';
 * const token = 'your-jwt-token'; // Optional
 * const ws = new WebSocket(token ? `${wsUrl}?token=${token}` : wsUrl);
 *
 * ws.onopen = () => {
 *   console.log('✅ Connected!');
 *   ws.send(JSON.stringify({ action: 'sendMessage', message: 'Hello!' }));
 * };
 *
 * ws.onmessage = (event) => {
 *   console.log('📨 Received:', JSON.parse(event.data));
 * };
 *
 * ws.onerror = (error) => {
 *   console.error('❌ Error:', error);
 * };
 *
 * ws.onclose = () => {
 *   console.log('🔌 Connection closed');
 * };
 */

console.log('WebSocket Test Script');
console.log('=====================\n');
console.log('To test WebSocket connections, use the browser console code above,');
console.log('or install the ws package for Node.js:\n');
console.log('  npm install --save-dev ws @types/ws\n');
console.log('Then run:');
console.log('  tsx scripts/test-websocket.ts wss://your-api.execute-api.us-east-2.amazonaws.com/prod [token]\n');
console.log('Example browser console code:\n');
console.log(`const ws = new WebSocket('wss://your-api.execute-api.us-east-2.amazonaws.com/prod?token=YOUR_TOKEN');`);
console.log(`ws.onopen = () => console.log('Connected!');`);
console.log(`ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));`);
console.log(`ws.send(JSON.stringify({ action: 'sendMessage', message: 'Hello!' }));`);

export {};
