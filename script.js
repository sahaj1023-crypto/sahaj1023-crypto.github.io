// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- ⚠️ CRITICAL SECURITY RISK: DO NOT EXPOSE KEYS PUBLICLY ---
// Your API keys have been replaced with placeholders.
// Exposing these in client-side code can lead to abuse and unexpected charges.
// Store these securely on a backend server and have your website call your server.
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
// --------------------------------------------------------------------

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
    limitText: document.getElementById('limit-text'),
    batteryFill: document.getElementById('battery-fill'),
    overdriveStatusIndicator: document.getElementById('overdrive-status-indicator'),
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
    aboutNavBtn: document.getElementById('about-nav-btn'),
    aboutModalOverlay: document.getElementById('about-modal-overlay'),
    aboutModalCloseBtn: document.getElementById('about-modal-close-btn'),
    chatCard: document.getElementById('chat-card'),
    chatFullscreenBtn: document.getElementById('chat-fullscreen-btn'),
    limitCard: document.getElementById('limit-card'),
    promptSuggestions: document.getElementById('prompt-suggestions'),
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
        { 
            label: 'Energy (kWh)', 
            data: [], 
            backgroundColor: 'rgba(0, 246, 255, 0.1)', // Neon Cyan Fill
            yAxisID: 'y', 
            fill: true, 
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 6
        },
        { 
            label: 'Cost (Rs)', 
            data: [], 
            backgroundColor: 'rgba(217, 70, 239, 0.1)', // Electric Purple Fill
            yAxisID: 'y1', 
            fill: true, 
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 6
        }
    ]
};

let chartOptions = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    scales: {
        x: { 
            title: { display: true, text: 'Time' },
        },
        y: { 
            type: 'linear', 
            position: 'left', 
            title: { display: true, text: 'Energy (kWh)' }, 
        },
        y1: { 
            type: 'linear', 
            position: 'right', 
            title: { display: true, text: 'Cost (Rs)' }, 
            grid: { drawOnChartArea: false } 
        }
    },
    plugins: {
        legend: {
            labels: {
                // This object now exists, so its color property can be set later.
            }
        }
    }
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
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
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
                if (dataHistory.length > MAX_HISTORY_LENGTH) dataHistory.shift();
                
                updateDashboard(data);
                updateBatteryIndicator(data);
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
    resetBatteryIndicator();
    resetCharts();
    dataHistory = [];
}

// --- UI State Management ---
function setConnectionState(state, message = '') {
    ui.connectBtn.classList.remove('hidden');
    ui.disconnectBtn.classList.add('hidden');
    ui.connectBtnText.classList.remove('hidden');
    ui.connectSpinner.classList.add('hidden');
    ui.connectBtn.disabled = false;
    
    ui.statusDot.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500');
    ui.statusDot.classList.add('bg-slate-600');
    
    ui.overdriveStatusIndicator.classList.add('hidden');

    switch (state) {
        case 'connecting':
            ui.connectBtn.disabled = true;
            ui.connectBtnText.classList.add('hidden');
            ui.connectSpinner.classList.remove('hidden');
            ui.statusDot.classList.add('bg-yellow-500');
            ui.statusText.textContent = "Connecting...";
            break;
        case 'connected':
            ui.connectBtn.classList.add('hidden');
            ui.disconnectBtn.classList.remove('hidden');
            ui.statusDot.classList.add('bg-green-500');
            ui.statusText.textContent = "Live Data Received";
            break;
        case 'disconnected':
            ui.statusText.textContent = "Disconnected";
            break;
        case 'error':
            ui.statusDot.classList.add('bg-red-500');
            ui.statusText.textContent = message || "Connection Failed";
            break;
    }
}

function updateDashboard(data) {
    ui.power.textContent = parseFloat(data.power).toFixed(2);
    ui.voltage.textContent = parseFloat(data.voltage).toFixed(2);
    ui.current.textContent = parseFloat(data.current).toFixed(3);
    
    const energyTile = document.querySelector('[data-metric="energy"] .metric-value');
    if (energyTile) energyTile.textContent = parseFloat(data.energy).toFixed(4);
    
    const costTile = document.querySelector('[data-metric="cost"] .metric-value');
    if(costTile) costTile.textContent = parseFloat(data.cost).toFixed(2);
}

function updateBatteryIndicator(data) {
    const energy = parseFloat(data.energy);
    const limit = parseFloat(data.limit);

    if (isNaN(energy) || isNaN(limit) || limit <= 0) {
        resetBatteryIndicator();
        return;
    }

    const percentage = (energy / limit) * 100;
    ui.batteryFill.style.width = `${Math.min(percentage, 100)}%`;
    ui.limitText.textContent = `${energy.toFixed(4)} / ${limit.toFixed(2)} kWh`;

    ui.batteryFill.classList.remove('state-low', 'state-medium', 'state-high');
    ui.limitCard.classList.remove('aura-low', 'aura-medium', 'aura-high');
    
    if (percentage > 80) {
        ui.batteryFill.classList.add('state-high');
        ui.limitCard.classList.add('aura-high');
    } else if (percentage > 50) {
        ui.batteryFill.classList.add('state-medium');
        ui.limitCard.classList.add('aura-medium');
    } else {
        ui.batteryFill.classList.add('state-low');
        ui.limitCard.classList.add('aura-low');
    }

    if (data.overdrive) {
        ui.overdriveStatusIndicator.classList.remove('hidden');
    } else {
        ui.overdriveStatusIndicator.classList.add('hidden');
    }
}

function resetBatteryIndicator() {
    ui.limitText.textContent = `-.-- / -.-- kWh`;
    ui.batteryFill.style.width = '0%';
    ui.batteryFill.classList.remove('state-medium', 'state-high');
    ui.batteryFill.classList.add('state-low');
    ui.limitCard.classList.remove('aura-medium', 'aura-high');
    ui.limitCard.classList.add('aura-low');
    ui.overdriveStatusIndicator.classList.add('hidden');
}


// --- Gemini Chat Logic ---
ui.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userInput = ui.chatInput.value.trim();
    if (!userInput) return;

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        addMessageToChat("Error", "Gemini API key is missing or invalid. Please add it to the top of script.js.", true);
        return;
    }

    addMessageToChat("You", userInput, false);
    ui.chatInput.value = '';
    setLoading(true);

    try {
        const sensorDataContext = JSON.stringify(currentSensorData, null, 2);
        const fullPrompt = `Based on the following real-time data from an ESP32 power monitor, answer the user's question.\n\nSensor Data:\n${sensorDataContext}\n\nUser Question: "${userInput}"`;
        const systemPrompt = "You are a helpful power management assistant named Elyra AI. Analyze the provided real-time data to answer user questions concisely. Provide suggestions to save energy or explain the current power consumption. If the question is not related to power, act as a general conversational AI. Format your response using simple markdown for readability.";
        
        const response = await callGeminiApi(fullPrompt, systemPrompt);
        addMessageToChat("Elyra", response, true);
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
    const senderName = sender;
    messageDiv.className = `p-3 max-w-lg text-sm ${isAI ? 'chat-ai' : 'chat-user ml-auto'}`;
    messageDiv.innerHTML = `<p class="font-semibold" style="color: ${isAI ? 'var(--accent-cyan)' : 'var(--accent-purple)'};">${senderName}</p><p class="text-text-primary whitespace-pre-wrap">${message}</p>`;
    ui.chatContainer.appendChild(messageDiv);
    ui.chatContainer.scrollTop = ui.chatContainer.scrollHeight;
}

function setLoading(isLoading) {
    ui.chatSubmit.disabled = isLoading;
    ui.sendText.classList.toggle('hidden', isLoading);
    ui.sendSpinner.classList.toggle('hidden', !isLoading);
}

// --- Modal and Graph Interaction Logic ---
function showHistoryModal(metric, title) {
    ui.modalTitle.textContent = title;
    const historyBody = ui.modalBody;
    historyBody.innerHTML = '';
    const filteredHistory = dataHistory.map(e => ({ value: e.data[metric], ts: e.timestamp })).filter(e => e.value !== undefined).reverse();

    if (filteredHistory.length === 0) {
        historyBody.innerHTML = '<p class="text-text-secondary text-center">No history to display yet. Waiting for live data...</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'history-table';
        table.innerHTML = `<thead><tr><th>Value</th><th>Time</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        filteredHistory.forEach(item => {
            const row = document.createElement('tr');
            const val = typeof item.value === 'number' ? item.value.toFixed(4) : item.value;
            row.innerHTML = `<td>${val}</td><td class="timestamp">${new Date(item.ts).toLocaleTimeString()}</td>`;
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
    setTimeout(() => { ui.graphModalOverlay.classList.add('visible'); if (expandedConsumptionChart) expandedConsumptionChart.resize(); }, 10);
}

function hideGraphModal() {
    ui.graphModalOverlay.classList.remove('visible');
    setTimeout(() => ui.graphModalOverlay.classList.add('hidden'), 300);
}

function showAboutModal() {
    ui.aboutModalOverlay.classList.remove('hidden');
    setTimeout(() => ui.aboutModalOverlay.classList.add('visible'), 10);
}

function hideAboutModal() {
    ui.aboutModalOverlay.classList.remove('visible');
    setTimeout(() => ui.aboutModalOverlay.classList.add('hidden'), 300);
}


// --- Theme Management ---
function updateChartTheme() {
    if (!consumptionChart || !expandedConsumptionChart) {
        return;
    }

    const style = getComputedStyle(document.body);
    
    const gridColor = style.getPropertyValue('--grid-line-color').trim();
    const textColor = style.getPropertyValue('--text-secondary').trim();
    const legendColor = style.getPropertyValue('--text-primary').trim();
    const line1Color = style.getPropertyValue('--graph-line-1').trim();
    const line2Color = style.getPropertyValue('--graph-line-2').trim();

    consumptionChart.data.datasets[0].borderColor = line1Color;
    consumptionChart.data.datasets[1].borderColor = line2Color;
    expandedConsumptionChart.data.datasets[0].borderColor = line1Color;
    expandedConsumptionChart.data.datasets[1].borderColor = line2Color;

    const newOptions = { ...chartOptions };
    newOptions.scales.x.ticks.color = textColor;
    newOptions.scales.x.grid.color = gridColor;
    newOptions.scales.x.title.color = textColor;
    
    newOptions.scales.y.ticks.color = textColor;
    newOptions.scales.y.grid.color = gridColor;
    newOptions.scales.y.title.color = textColor;
    
    newOptions.scales.y1.ticks.color = textColor;
    newOptions.scales.y1.title.color = textColor;
    
    newOptions.plugins.legend.labels.color = legendColor;

    consumptionChart.options = newOptions;
    expandedConsumptionChart.options = newOptions;

    consumptionChart.update('none');
    expandedConsumptionChart.update('none');
}

// --- Page Load Logic ---
window.onload = () => {
    initializeCharts();
    updateDashboard(initialData);
    resetBatteryIndicator();

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') document.body.classList.add('light-mode');
    updateChartTheme(); 

    ui.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const newTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        updateChartTheme();
    });

    setTimeout(() => {
        if (ui.loader) ui.loader.classList.add('hidden');
        if (ui.mainContent) ui.mainContent.classList.add('visible');
        document.querySelectorAll('.animated').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 1500);

    ui.connectBtn.addEventListener('click', connectToESP32);
    ui.disconnectBtn.addEventListener('click', disconnectFromESP32);

    ui.chatFullscreenBtn.addEventListener('click', () => {
        const chatCard = ui.chatCard;
        if (!chatCard.classList.contains('chat-fullscreen')) {
             // Store original position
            const rect = chatCard.getBoundingClientRect();
            chatCard.style.setProperty('--og-left', `${rect.left}px`);
            chatCard.style.setProperty('--og-top', `${rect.top}px`);
            chatCard.style.setProperty('--og-width', `${rect.width}px`);
            chatCard.style.setProperty('--og-height', `${rect.height}px`);
        }
        chatCard.classList.toggle('chat-fullscreen');
        document.body.classList.toggle('chat-fullscreen-active');
    });
    
    ui.promptSuggestions.addEventListener('click', (e) => {
        if (e.target.classList.contains('prompt-button')) {
            const promptText = e.target.textContent.replace(/"/g, '');
            ui.chatInput.value = promptText;
            ui.chatForm.requestSubmit();
        }
    });

    document.querySelectorAll('[data-metric]').forEach(card => {
        card.addEventListener('click', (event) => {
            const metricTarget = event.target.closest('[data-metric]');
            if (metricTarget) {
                 const metric = metricTarget.dataset.metric;
                 const title = metricTarget.dataset.title;
                 showHistoryModal(metric, title);
            }
        });
    });
    
    ui.chartCard.addEventListener('click', showGraphModal);
    ui.aboutNavBtn.addEventListener('click', showAboutModal);

    // Modal close listeners
    ui.modalCloseBtn.addEventListener('click', hideHistoryModal);
    ui.historyModalOverlay.addEventListener('click', (e) => { if (e.target === ui.historyModalOverlay) hideHistoryModal(); });
    ui.graphModalCloseBtn.addEventListener('click', hideGraphModal);
    ui.graphModalOverlay.addEventListener('click', (e) => { if (e.target === ui.graphModalOverlay) hideGraphModal(); });
    ui.aboutModalCloseBtn.addEventListener('click', hideAboutModal);
    ui.aboutModalOverlay.addEventListener('click', (e) => { if (e.target === ui.aboutModalOverlay) hideAboutModal(); });

    // --- NEW: Starfield Background Animation ---
    const starfieldCanvas = document.getElementById('starfield');
    if (starfieldCanvas) {
        const ctx = starfieldCanvas.getContext('2d');
        let stars = [];
        let numStars = 200;

        function setCanvasSize() {
            starfieldCanvas.width = window.innerWidth;
            starfieldCanvas.height = window.innerHeight;
        }

        function createStars() {
            stars = [];
            for (let i = 0; i < numStars; i++) {
                stars.push({
                    x: Math.random() * starfieldCanvas.width,
                    y: Math.random() * starfieldCanvas.height,
                    radius: Math.random() * 1.5 + 0.5,
                    alpha: Math.random(),
                    speed: Math.random() * 0.2 + 0.1,
                    twinkleSpeed: Math.random() * 0.015 + 0.005
                });
            }
        }

        function drawStars() {
            ctx.clearRect(0, 0, starfieldCanvas.width, starfieldCanvas.height);
            for (let i = 0; i < numStars; i++) {
                const star = stars[i];
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                
                // Pulsating effect for twinkling
                star.alpha += star.twinkleSpeed;
                if (star.alpha > 1 || star.alpha < 0) {
                    star.twinkleSpeed = -star.twinkleSpeed;
                }
                
                ctx.fillStyle = `rgba(229, 231, 235, ${star.alpha * 0.7})`; // Uses text-primary color
                ctx.fill();

                // Move star
                star.y += star.speed;
                if (star.y > starfieldCanvas.height) {
                    star.y = 0;
                    star.x = Math.random() * starfieldCanvas.width;
                }
            }
        }

        function animateStarfield() {
            drawStars();
            requestAnimationFrame(animateStarfield);
        }

        window.addEventListener('resize', () => {
            setCanvasSize();
            createStars();
        });

        setCanvasSize();
        createStars();
        animateStarfield();
    }
};

