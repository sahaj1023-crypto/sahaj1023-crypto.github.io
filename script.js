// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- ⚠️ ACTION REQUIRED: PASTE YOUR CREDENTIALS HERE ---
const firebaseConfig = {
  apiKey: "AIzaSyAiGkLA3M-YGARgmGieYcsgVsfdmF0sZUQ",
  authDomain: "urja-power-monitor-2025.firebaseapp.com",
  databaseURL: "https://urja-power-monitor-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "urja-power-monitor-2025",
  storageBucket: "urja-power-monitor-2025.firebasestorage.app",
  messagingSenderId: "692578664929",
  appId: "1:692578664929:web:ae56ba8691977795ea92a0"
};
const GEMINI_API_KEY = "AIzaSyCk41lcad7d659M5_zHkU-25FchQhD3P_s";
// -----------------------------------------------------------

// --- DOM Elements ---
const ui = {
    loader: document.getElementById('loader'),
    mainContent: document.getElementById('main-content'),
    connectBtn: document.getElementById('connect-btn'),
    connectBtnText: document.getElementById('connect-btn-text'),
    connectSpinner: document.getElementById('connect-spinner'),
    disconnectBtn: document.getElementById('disconnect-btn'),
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
    chartCard: document.getElementById('chart-card'),
    chartCanvas: document.getElementById('consumptionChart'),
    historyModalOverlay: document.getElementById('history-modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    graphModalOverlay: document.getElementById('graph-modal-overlay'),
    expandedChartCanvas: document.getElementById('expandedConsumptionChart'),
    graphModalCloseBtn: document.getElementById('graph-modal-close-btn'),
    themeToggle: document.getElementById('theme-toggle'),
};

// --- App State ---
let currentSensorData = {};
let consumptionChart, expandedConsumptionChart;
let firebaseListener = null;
let dataHistory = [];
const MAX_HISTORY_LENGTH = 100;

const initialData = {
    power: "-.--", voltage: "-.--", current: "-.--",
    energy: "-.--", cost: "-.--", limit: "-.--",
    overdrive: false
};

// --- Chart.js Logic ---
const chartData = {
    labels: [],
    datasets: [
        { label: 'Energy (kWh)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.2)', yAxisID: 'y', fill: true, tension: 0.4 },
        { label: 'Cost (Rs)', data: [], borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)', yAxisID: 'y1', fill: true, tension: 0.4 }
    ]
};

let chartOptions = { // Use let to allow modification
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.4)' } },
        y: { type: 'linear', position: 'left', title: { display: true, text: 'Energy (kWh)', color: '#64748b' }, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.4)' } },
        y1: { type: 'linear', position: 'right', title: { display: true, text: 'Cost (Rs)', color: '#64748b' }, ticks: { color: '#9ca3af' }, grid: { drawOnChartArea: false } }
    },
    plugins: { legend: { labels: { color: '#e5e7eb' } } }
};

function initializeCharts() {
    if (ui.chartCanvas) {
        const ctx = ui.chartCanvas.getContext('2d');
        consumptionChart = new Chart(ctx, { type: 'line', data: chartData, options: chartOptions });
    }
    if (ui.expandedChartCanvas) {
        const ctx = ui.expandedChartCanvas.getContext('2d');
        expandedConsumptionChart = new Chart(ctx, { type: 'line', data: chartData, options: chartOptions });
    }
}

function updateCharts() {
    const MAX_DATA_POINTS = 30;
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    chartData.labels.push(timeLabel);
    chartData.datasets[0].data.push(parseFloat(currentSensorData.energy));
    chartData.datasets[1].data.push(parseFloat(currentSensorData.cost));

    if (chartData.labels.length > MAX_DATA_POINTS) {
        chartData.labels.shift();
        chartData.datasets.forEach(dataset => dataset.data.shift());
    }
    if (consumptionChart) consumptionChart.update();
    if (expandedConsumptionChart) expandedConsumptionChart.update();
}

function resetCharts() {
    chartData.labels = [];
    chartData.datasets.forEach(dataset => dataset.data = []);
    if(consumptionChart) consumptionChart.update();
    if(expandedConsumptionChart) expandedConsumptionChart.update();
}

// --- Firebase Connection Logic ---
function connectToESP32() {
    setConnectionState('connecting');
    try {
        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);
        const dataRef = ref(db, '/sensorData');

        firebaseListener = onValue(dataRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const timestamp = Date.now();
                currentSensorData = data;
                dataHistory.push({ data, timestamp });
                if (dataHistory.length > MAX_HISTORY_LENGTH) {
                    dataHistory.shift();
                }
                updateDashboard(data);
                updateCharts();
                setConnectionState('connected');
            } else {
                setConnectionState('error', "Waiting for data from ESP32...");
            }
        }, (error) => {
            console.error("Firebase read failed: ", error);
            setConnectionState('error', "Firebase connection failed.");
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        setConnectionState('error', "Firebase config is invalid.");
    }
}

function disconnectFromESP32() {
    if (firebaseListener) {
        firebaseListener();
        firebaseListener = null;
    }
    setConnectionState('disconnected');
    updateDashboard(initialData);
    resetCharts();
    dataHistory = [];
}

// --- UI State Management ---
function setConnectionState(state, message = '') {
    // ... (This function is unchanged)
    ui.connectBtn.classList.remove('hidden');
    ui.disconnectBtn.classList.add('hidden');
    ui.connectBtnText.classList.remove('hidden');
    ui.connectSpinner.classList.add('hidden');
    ui.connectBtn.disabled = false;
    ui.statusDot.className = 'w-2.5 h-2.5 rounded-full';

    switch (state) {
        case 'connecting':
            ui.connectBtn.disabled = true;
            ui.connectBtnText.classList.add('hidden');
            ui.connectSpinner.classList.remove('hidden');
            ui.statusDot.classList.add('bg-yellow-500', 'animate-pulse');
            ui.statusText.textContent = "Connecting...";
            break;
        case 'connected':
            ui.connectBtn.classList.add('hidden');
            ui.disconnectBtn.classList.remove('hidden');
            ui.statusDot.classList.add('bg-green-500');
            ui.statusText.textContent = "Live Data Received";
            break;
        case 'disconnected':
            ui.statusDot.classList.add('bg-slate-600');
            ui.statusText.textContent = "Disconnected";
            break;
        case 'error':
            ui.statusDot.classList.add('bg-red-500', 'animate-pulse');
            ui.statusText.textContent = message || "Connection Failed";
            break;
    }
}

function updateDashboard(data) {
    ui.power.textContent = `${parseFloat(data.power).toFixed(2)}`;
    ui.voltage.textContent = `${parseFloat(data.voltage).toFixed(2)}`;
    ui.current.textContent = `${parseFloat(data.current).toFixed(3)}`;
    ui.energy.innerHTML = `${parseFloat(data.energy).toFixed(4)} <span class="text-lg font-medium text-text-secondary">kWh</span>`;
    ui.cost.innerHTML = `${parseFloat(data.cost).toFixed(2)} <span class="text-lg font-medium text-text-secondary">Rs</span>`;
    ui.limit.innerHTML = `${parseFloat(data.limit).toFixed(2)} <span class="text-lg font-medium text-text-secondary">kWh</span>`;
    ui.overdrive.textContent = `Overdrive: ${data.overdrive ? 'ON' : 'OFF'}`;
    ui.overdrive.className = `text-xs font-semibold mt-1 ${data.overdrive ? 'text-green-400' : 'text-slate-500'}`;
}

// --- Gemini Chat Logic ---
ui.chatForm.addEventListener('submit', async (e) => { e.preventDefault(); const userInput = ui.chatInput.value.trim(); if (!userInput) return; if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") { addMessageToChat("Error", "Gemini API key is missing.", true); return; } addMessageToChat("You", userInput, false); ui.chatInput.value = ''; setLoading(true); try { const sensorDataContext = JSON.stringify(currentSensorData, null, 2); const fullPrompt = `Based on the following real-time data from an ESP32 power monitor, answer the user's question.\n\nSensor Data:\n${sensorDataContext}\n\nUser Question: "${userInput}"`; const systemPrompt = "You are a helpful power management assistant named Urja AI. Analyze the provided real-time data to answer user questions concisely. Provide suggestions to save energy or explain the current power consumption. If the question is not related to power, act as a general conversational AI. Format your response using simple markdown for readability."; const response = await callGeminiApi(fullPrompt, systemPrompt); addMessageToChat("Gemini", response, true); } catch (error) { console.error("Gemini API Error:", error); addMessageToChat("Error", `Could not connect to the Gemini API.\nReason: ${error.message}`, true); } finally { setLoading(false); } });
async function callGeminiApi(prompt, systemPrompt) { const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`; const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } }; const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) { let errorMessage = `API request failed with status ${response.status}`; try { const errorBody = await response.json(); errorMessage = errorBody.error?.message || JSON.stringify(errorBody); } catch (e) { errorMessage += `\nResponse: ${await response.text()}`; } throw new Error(errorMessage); } const data = await response.json(); return data.candidates[0].content.parts[0].text; }
function addMessageToChat(sender, message, isAI) { const messageDiv = document.createElement('div'); const senderName = isAI ? 'Gemini' : 'You'; const senderNameColor = isAI ? 'text-cyan-400' : 'text-slate-300'; messageDiv.className = `p-3 rounded-lg max-w-lg text-sm ${isAI ? 'chat-ai' : 'chat-user ml-auto'}`; messageDiv.innerHTML = `<p class="font-semibold ${senderNameColor} mb-1">${senderName}</p><p class="text-text-primary whitespace-pre-wrap">${message}</p>`; ui.chatContainer.appendChild(messageDiv); ui.chatContainer.scrollTop = ui.chatContainer.scrollHeight; }
function setLoading(isLoading) { ui.chatSubmit.disabled = isLoading; ui.sendText.classList.toggle('hidden', isLoading); ui.sendSpinner.classList.toggle('hidden', !isLoading); }

// --- Modal and Graph Interaction Logic ---
function showHistoryModal(metric, title) {
    ui.modalTitle.textContent = title;
    const historyBody = ui.modalBody;
    historyBody.innerHTML = '';

    const filteredHistory = dataHistory
        .map(entry => ({ value: entry.data[metric], timestamp: entry.timestamp }))
        .filter(entry => entry.value !== undefined)
        .reverse();

    if (filteredHistory.length === 0) {
        historyBody.innerHTML = '<p class="text-text-secondary text-center">No history to display yet. Waiting for live data...</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'history-table';
        table.innerHTML = `<thead><tr><th>Value</th><th>Time</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        filteredHistory.forEach(item => {
            const row = document.createElement('tr');
            const value = typeof item.value === 'number' ? item.value.toFixed(4) : item.value;
            const time = new Date(item.timestamp).toLocaleTimeString();
            row.innerHTML = `<td>${value}</td><td class="timestamp">${time}</td>`;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        historyBody.appendChild(table);
    }

    ui.historyModalOverlay.classList.remove('hidden');
    setTimeout(() => ui.historyModalOverlay.classList.add('visible'), 10);
}

function hideHistoryModal() {
    ui.historyModalOverlay.classList.remove('visible');
    setTimeout(() => ui.historyModalOverlay.classList.add('hidden'), 300);
}

function showGraphModal() {
    ui.graphModalOverlay.classList.remove('hidden');
    setTimeout(() => {
        ui.graphModalOverlay.classList.add('visible');
        if (expandedConsumptionChart) {
            expandedConsumptionChart.resize();
        }
    }, 10);
}

function hideGraphModal() {
    ui.graphModalOverlay.classList.remove('visible');
    setTimeout(() => ui.graphModalOverlay.classList.add('hidden'), 300);
}

// --- Theme Management ---
function updateChartTheme() {
    const isLightMode = document.body.classList.contains('light-mode');
    const textColor = isLightMode ? '#475569' : '#9ca3af';
    const gridColor = isLightMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(55, 65, 81, 0.4)';
    const legendColor = isLightMode ? '#1e293b' : '#e5e7eb';

    const newOptions = { ...chartOptions };
    newOptions.scales.x.ticks.color = textColor;
    newOptions.scales.x.grid.color = gridColor;
    newOptions.scales.y.ticks.color = textColor;
    newOptions.scales.y.grid.color = gridColor;
    newOptions.scales.y.title.color = textColor;
    newOptions.scales.y1.ticks.color = textColor;
    newOptions.scales.y1.title.color = textColor;
    newOptions.plugins.legend.labels.color = legendColor;

    if (consumptionChart) {
        consumptionChart.options = newOptions;
        consumptionChart.update();
    }
    if (expandedConsumptionChart) {
        expandedConsumptionChart.options = newOptions;
        expandedConsumptionChart.update();
    }
}

// --- Page Load Logic ---
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    updateDashboard(initialData);

    // Theme setup
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
    updateChartTheme(); // Update chart on initial load

    ui.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const newTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        updateChartTheme();
    });

    setTimeout(() => {
        ui.loader.classList.add('hidden');
        ui.mainContent.classList.add('visible');
        document.querySelectorAll('.animated').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 2500);

    // Connection button listeners
    ui.connectBtn.addEventListener('click', connectToESP32);
    ui.disconnectBtn.addEventListener('click', disconnectFromESP32);

    // Data card listeners
    const interactiveCards = document.querySelectorAll('.data-card[data-metric]');
    interactiveCards.forEach(card => {
        card.addEventListener('click', () => {
            const metric = card.dataset.metric;
            const title = card.dataset.title;
            showHistoryModal(metric, title);
        });
    });
    
    // Graph card listener
    ui.chartCard.addEventListener('click', showGraphModal);

    // Modal close listeners
    ui.modalCloseBtn.addEventListener('click', hideHistoryModal);
    ui.historyModalOverlay.addEventListener('click', (e) => {
        if (e.target === ui.historyModalOverlay) hideHistoryModal();
    });
    ui.graphModalCloseBtn.addEventListener('click', hideGraphModal);
    ui.graphModalOverlay.addEventListener('click', (e) => {
        if (e.target === ui.graphModalOverlay) hideGraphModal();
    });
});

