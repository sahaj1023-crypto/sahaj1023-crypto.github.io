// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- ⚠️ ACTION REQUIRED: PASTE YOUR CREDENTIALS HERE ---
// 1. Paste your Firebase project configuration here.
const firebaseConfig = {
  apiKey: "AIzaSyAiGkLA3M-YGARgmGieYcsgVsfdmF0sZUQ",
  authDomain: "urja-power-monitor-2025.firebaseapp.com",
  databaseURL: "https://urja-power-monitor-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "urja-power-monitor-2025",
  storageBucket: "urja-power-monitor-2025.firebasestorage.app",
  messagingSenderId: "692578664929",
  appId: "1:692578664929:web:ae56ba8691977795ea92a0"
};
// 2. Paste your Gemini API Key here.
const GEMINI_API_KEY = "AIzaSyCk41lcad7d659M5_zHkU-25FchQhD3P_s";
// -----------------------------------------------------------

// --- DOM Elements ---
const ui = {
    voltage: document.getElementById('voltage'),
    current: document.getElementById('current'),
    power: document.getElementById('power'),
    energy: document.getElementById('energy'),
    cost: document.getElementById('cost'),
    limit: document.getElementById('limit'),
    overdrive: document.getElementById('overdrive-status'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    chatSubmit: document.getElementById('chat-submit'),
    chatContainer: document.getElementById('chat-container'),
    sendText: document.getElementById('send-text'),
    sendSpinner: document.getElementById('send-spinner'),
};

let currentSensorData = {};

// --- Firebase Initialization ---
try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const dataRef = ref(db, '/sensorData');
    
    ui.statusText.textContent = "Connecting to Database...";

    onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentSensorData = data; // Store latest data
            updateDashboard(data);
            
            if (ui.statusDot.classList.contains('bg-red-500')) {
                ui.statusDot.classList.remove('bg-red-500', 'animate-pulse');
                ui.statusDot.classList.add('bg-green-500');
                ui.statusText.textContent = "Live Data Received";
            }
        } else {
           handleConnectionError("No data received from ESP32 yet.");
        }
    }, (error) => {
         console.error("Firebase read failed: ", error);
         handleConnectionError("Firebase connection failed. Check console and credentials.");
    });

} catch (error) {
    console.error("Firebase initialization error:", error);
    handleConnectionError("Firebase config is invalid. Please check your credentials.");
}

function handleConnectionError(message) {
    ui.statusDot.classList.remove('bg-green-500');
    ui.statusDot.classList.add('bg-red-500', 'animate-pulse');
    ui.statusText.textContent = message;
}

// --- UI Update Function ---
function updateDashboard(data) {
    ui.voltage.innerHTML = `${parseFloat(data.voltage).toFixed(2)} <span class="text-xl font-medium text-gray-400">V</span>`;
    ui.current.innerHTML = `${parseFloat(data.current).toFixed(3)} <span class="text-xl font-medium text-gray-400">A</span>`;
    ui.power.innerHTML = `${parseFloat(data.power).toFixed(2)} <span class="text-xl font-medium text-gray-400">W</span>`;
    ui.energy.innerHTML = `${parseFloat(data.energy).toFixed(4)} <span class="text-xl font-medium text-gray-400">kWh</span>`;
    ui.cost.innerHTML = `${parseFloat(data.cost).toFixed(2)} <span class="text-xl font-medium text-gray-400">Rs</span>`;
    ui.limit.innerHTML = `${parseFloat(data.limit).toFixed(2)} <span class="text-xl font-medium text-gray-400">kWh</span>`;
    ui.overdrive.textContent = `Overdrive: ${data.overdrive ? 'ON' : 'OFF'}`;
    ui.overdrive.className = `text-sm font-semibold mt-2 ${data.overdrive ? 'text-green-400' : 'text-gray-500'}`;
}

// --- Gemini Chat Logic ---
ui.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userInput = ui.chatInput.value.trim();
    if (!userInput) return;

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        addMessageToChat("Error", "Gemini API key is missing. Please add it to the script.", true);
        return;
    }

    addMessageToChat("You", userInput, false);
    ui.chatInput.value = '';
    setLoading(true);

    try {
        const sensorDataContext = JSON.stringify(currentSensorData, null, 2);
        const fullPrompt = `Based on the following real-time data from an ESP32 power monitor, answer the user's question.\n\nSensor Data:\n${sensorDataContext}\n\nUser Question: "${userInput}"`;
        
        const systemPrompt = "You are a helpful power management assistant named Urja AI. Analyze the provided real-time data from an ESP32 power monitor to answer user questions concisely. Provide suggestions to save energy or explain the current power consumption. If the question is not related to power, act as a general conversational AI. Format your response using simple markdown for readability.";

        const response = await callGeminiApi(fullPrompt, systemPrompt);
        addMessageToChat("Gemini", response, true);
    } catch (error) {
        console.error("Gemini API Error:", error);
        // Display the specific error message from the API call
        addMessageToChat("Error", `Could not connect to the Gemini API.\nReason: ${error.message}`, true);
    } finally {
        setLoading(false);
    }
});

async function callGeminiApi(prompt, systemPrompt) {
    // UPDATED: Using a more recent Gemini model endpoint
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    // UPDATED: Improved error parsing to provide clearer feedback
    if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        try {
            const errorBody = await response.json();
            // Extract the specific error message from Google's response
            errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
        } catch (e) {
            // Fallback if the response is not valid JSON
            errorMessage += `\nResponse: ${await response.text()}`;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function addMessageToChat(sender, message, isAI) {
    const messageDiv = document.createElement('div');
    const senderClass = isAI ? 'bg-cyan-900/50' : 'bg-gray-700 ml-auto';
    const senderName = isAI ? 'Gemini' : 'You';
    const senderNameColor = isAI ? 'text-cyan-400' : 'text-gray-300';

    messageDiv.className = `p-3 rounded-lg ${senderClass} max-w-lg`;
    messageDiv.innerHTML = `<p class="font-semibold ${senderNameColor}">${senderName}</p><p class="text-gray-300 whitespace-pre-wrap">${message}</p>`;
    
    ui.chatContainer.appendChild(messageDiv);
    ui.chatContainer.scrollTop = ui.chatContainer.scrollHeight;
}

function setLoading(isLoading) {
    ui.chatSubmit.disabled = isLoading;
    ui.sendText.classList.toggle('hidden', isLoading);
    ui.sendSpinner.classList.toggle('hidden', !isLoading);
}

