// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAiGkLA3M-YGARgmGieYcsgVsfdmF0sZUQ",
  authDomain: "urja-power-monitor-2025.firebaseapp.com",
  databaseURL: "https://urja-power-monitor-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "urja-power-monitor-2025",
  storageBucket: "urja-power-monitor-2025.firebasestorage.app",
  messagingSenderId: "692578664929",
  appId: "1:692578664929:web:ae56ba8691977795ea92a0"
};

const GEMINI_API_KEY = "AIzaSyCk41lcad7d659M5_zHkU-25FchQhD3P_s"; // Keep this empty on the client-side
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// --- DOM Elements ---
const voltageEl = document.getElementById('voltage');
const currentEl = document.getElementById('current');
const powerEl = document.getElementById('power');
const costEl = document.getElementById('cost');
const energyEl = document.getElementById('energy');
const timestampEl = document.getElementById('timestamp');
const voltageNeedle = document.getElementById('voltage-gauge-needle');
const currentNeedle = document.getElementById('current-gauge-needle');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSubmitBtn = document.getElementById('chat-submit-btn');

// --- Global State ---
let currentData = {};
let powerReadingsHistory = [];

// --- Chart.js Initialization ---
const ctx = document.getElementById('powerChart').getContext('2d');
const powerChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Power (W)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }
        },
        plugins: { legend: { display: false } }
    }
});

// --- UI Update Functions ---

/**
 * Updates the SVG gauge needle rotation.
 * @param {HTMLElement} needleEl - The needle element.
 * @param {number} value - The current value.
 * @param {number} maxValue - The max value for the gauge scale.
 */
function updateGauge(needleEl, value, maxValue) {
    const percentage = Math.min(Math.max(value / maxValue, 0), 1);
    const angle = -90 + (percentage * 180); // Scale from -90 to +90 degrees
    needleEl.style.transform = `rotate(${angle}deg)`;
}

/**
 * Main function to update the entire UI with new data.
 * @param {object} data - The data object from Firebase.
 */
function updateUI(data) {
    if (!data) return;
    currentData = data;

    const v = parseFloat(data.voltage);
    const c = parseFloat(data.current);
    const p = parseFloat(data.power);

    // Update text values
    voltageEl.textContent = `${v.toFixed(1)} V`;
    currentEl.textContent = `${c.toFixed(2)} A`;
    powerEl.textContent = `${p.toFixed(0)} W`;
    costEl.textContent = `₹${parseFloat(data.cost).toFixed(2)}`;
    energyEl.textContent = `${parseFloat(data.energy).toFixed(3)} kWh`;
    timestampEl.textContent = `Last updated: ${new Date(data.timestamp).toLocaleString()}`;

    // Update gauges (assuming max values for visual scale)
    updateGauge(voltageNeedle, v, 300); // Max 300V
    updateGauge(currentNeedle, c, 10);   // Max 10A

    // Update chart
    const timeLabel = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    powerChart.data.labels.push(timeLabel);
    powerChart.data.datasets[0].data.push(p);

    if (powerChart.data.labels.length > 20) {
        powerChart.data.labels.shift();
        powerChart.data.datasets[0].data.shift();
    }
    powerChart.update('none');

    // Store history for AI
    powerReadingsHistory.push(p);
    if (powerReadingsHistory.length > 20) powerReadingsHistory.shift();
}

// --- Firebase Real-time Listener ---
const powerDataRef = ref(database, '/powerData');
onValue(powerDataRef, (snapshot) => updateUI(snapshot.val()));


// --- Chatbot Functionality ---

/**
 * Appends a message to the chat history UI.
 * @param {string} text - The message content.
 * @param {string} sender - 'user' or 'ai'.
 */
function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'user' ? 'user-message' : 'ai-message';
    messageDiv.textContent = text;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * This is the core logic for processing the chat input and calling the Gemini API.
 * It's separated from the event handler for clarity.
 */
async function processAndSubmitChat() {
    const userInput = chatInput.value.trim();
    if (!userInput) return;

    appendMessage(userInput, 'user');
    chatInput.value = '';
    chatSubmitBtn.disabled = true;

    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-message';
    loadingDiv.innerHTML = '<span class="animate-pulse">Urja AI is thinking...</span>';
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const prompt = `
        You are Urja AI, a friendly and helpful assistant for monitoring home electricity usage.
        Your user is asking a question about their power consumption.
        Use the following real-time data to provide a concise and clear answer. If the data is not relevant, answer the question generally.

        Current Real-time Data:
        - Voltage: ${currentData.voltage || 'N/A'}
        - Current: ${currentData.current || 'N/A'}
        - Power: ${currentData.power || 'N/A'}
        - Total Energy Today: ${currentData.energy || 'N/A'}
        - Estimated Cost Today: ${currentData.cost || 'N/A'}
        - Recent Power Trend (in Watts): ${powerReadingsHistory.join(', ') || 'N/A'}

        User's Question: "${userInput}"

        Your Answer:
    `;

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

        const result = await response.json();
        const aiResponse = result.candidates[0].content.parts[0].text;

        loadingDiv.remove(); // Remove loading indicator
        appendMessage(aiResponse, 'ai');

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        loadingDiv.textContent = 'Sorry, I had trouble connecting. Please try again.';
    } finally {
        chatSubmitBtn.disabled = false;
    }
}

/**
 * Attaches an event listener to the form. When the form is submitted (by clicking the button or pressing Enter),
 * this function prevents the default page reload and calls the chat processing logic.
 */
chatForm.addEventListener('submit', (event) => {
    // This is the critical line that PREVENTS the page from reloading.
    event.preventDefault();
    
    // Now, call the function that handles the chat logic.
    processAndSubmitChat();
});

