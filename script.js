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
    loader: document.getElementById('loader'),
    mainContent: document.getElementById('main-content'),
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
    chartCanvas: document.getElementById('consumptionChart'),
};

let currentSensorData = {};
let firstDataReceived = false; // Flag to handle the initial load

// --- Chart.js Initialization ---
let consumptionChart;
const chartData = {
    labels: [],
    datasets: [
        {
            label: 'Energy (kWh)',
            data: [],
            borderColor: 'rgb(34, 211, 238)', // cyan-400
            backgroundColor: 'rgba(34, 211, 238, 0.2)',
            yAxisID: 'y',
            fill: true,
            tension: 0.4,
        },
        {
            label: 'Cost (Rs)',
            data: [],
            borderColor: 'rgb(192, 132, 252)', // purple-400
            backgroundColor: 'rgba(192, 132, 252, 0.2)',
            yAxisID: 'y1',
            fill: true,
            tension: 0.4,
        }
    ]
};

function initializeChart() {
    if (!ui.chartCanvas) return;
    const ctx = ui.chartCanvas.getContext('2d');
    consumptionChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                },
                y: {
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'Energy (kWh)', color: '#64748b' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                },
                y1: {
                    type: 'linear', position: 'right',
                    title: { display: true, text: 'Cost (Rs)', color: '#64748b' },
                    ticks: { color: '#94a3b8' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } }
            }
        }
    });
}

function updateChart(newData) {
    const MAX_DATA_POINTS = 30;
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    chartData.labels.push(timeLabel);
    chartData.datasets[0].data.push(parseFloat(newData.energy));
    chartData.datasets[1].data.push(parseFloat(newData.cost));

    if (chartData.labels.length > MAX_DATA_POINTS) {
        chartData.labels.shift();
        chartData.datasets.forEach(dataset => dataset.data.shift());
    }

    if (consumptionChart) {
        consumptionChart.update();
    }
}


// --- Firebase Initialization ---
try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const dataRef = ref(db, '/sensorData');
    
    ui.statusText.textContent = "Connecting to Database...";

    onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentSensorData = data;
            updateDashboard(data);
            updateChart(data);
            
            // --- FIX: Hide loader only on first successful data receipt ---
            if (!firstDataReceived) {
                hideLoaderAndShowContent();
                firstDataReceived = true;
            }

            if (ui.statusDot.classList.contains('bg-red-500')) {
                ui.statusDot.classList.remove('bg-red-500', 'animate-pulse');
                ui.statusDot.classList.add('bg-green-500');
                ui.statusText.textContent = "Live Data Received";
            }
        } else {
           handleConnectionError("Waiting for data from ESP32...");
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
    ui.power.textContent = `${parseFloat(data.power).toFixed(2)}`;
    ui.voltage.textContent = `${parseFloat(data.voltage).toFixed(2)}`;
    ui.current.textContent = `${parseFloat(data.current).toFixed(3)}`;
    ui.energy.innerHTML = `${parseFloat(data.energy).toFixed(4)} <span class="text-lg font-medium text-slate-400">kWh</span>`;
    ui.cost.innerHTML = `${parseFloat(data.cost).toFixed(2)} <span class="text-lg font-medium text-slate-400">Rs</span>`;
    ui.limit.innerHTML = `${parseFloat(data.limit).toFixed(2)} <span class="text-lg font-medium text-slate-400">kWh</span>`;
    ui.overdrive.textContent = `Overdrive: ${data.overdrive ? 'ON' : 'OFF'}`;
    ui.overdrive.className = `text-xs font-semibold mt-1 ${data.overdrive ? 'text-green-400' : 'text-slate-500'}`;
}

// --- Gemini Chat Logic (Unchanged) ---
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
        const systemPrompt = "You are a helpful power management assistant named Urja AI. Analyze the provided real-time data to answer user questions concisely. Provide suggestions to save energy or explain the current power consumption. If the question is not related to power, act as a general conversational AI. Format your response using simple markdown for readability.";
        const response = await callGeminiApi(fullPrompt, systemPrompt);
        addMessageToChat("Gemini", response, true);
    } catch (error) {
        console.error("Gemini API Error:", error);
        addMessageToChat("Error", `Could not connect to the Gemini API.\nReason: ${error.message}`, true);
    } finally {
        setLoading(false);
    }
});

async function callGeminiApi(prompt, systemPrompt) {
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
    if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
        } catch (e) {
            errorMessage += `\nResponse: ${await response.text()}`;
        }
        throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function addMessageToChat(sender, message, isAI) {
    const messageDiv = document.createElement('div');
    const senderClass = isAI ? 'bg-cyan-900/50' : 'bg-slate-700 ml-auto';
    const senderName = isAI ? 'Gemini' : 'You';
    const senderNameColor = isAI ? 'text-cyan-400' : 'text-slate-300';
    messageDiv.className = `p-3 rounded-lg ${senderClass} max-w-lg text-sm`;
    messageDiv.innerHTML = `<p class="font-semibold ${senderNameColor} mb-1">${senderName}</p><p class="text-slate-300 whitespace-pre-wrap">${message}</p>`;
    ui.chatContainer.appendChild(messageDiv);
    ui.chatContainer.scrollTop = ui.chatContainer.scrollHeight;
}

function setLoading(isLoading) {
    ui.chatSubmit.disabled = isLoading;
    ui.sendText.classList.toggle('hidden', isLoading);
    ui.sendSpinner.classList.toggle('hidden', !isLoading);
}

// --- New Page Load Logic ---
function hideLoaderAndShowContent() {
    if (!ui.loader.classList.contains('hidden')) {
        ui.loader.classList.add('hidden');
        ui.mainContent.classList.add('visible');
        
        // Trigger the staggered card animations
        document.querySelectorAll('.animated').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeChart();

    // Fallback timer: If no data is received after 8 seconds, hide loader and show error.
    setTimeout(() => {
        if (!firstDataReceived) {
            console.warn("Firebase timeout. Hiding loader.");
            handleConnectionError("Connection timeout. Check ESP32 & credentials.");
            hideLoaderAndShowContent(); // Show main content even on failure
        }
    }, 8000); 
});

