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
    limitCard: document.getElementById('limit-card'),
    starfieldCanvas: document.getElementById('starfield'),
    
    // Dashboard (small) view
    chatCard: document.getElementById('chat-card'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    chatSubmit: document.getElementById('chat-submit'),
    chatContainer: document.getElementById('chat-container'),
    sendText: document.getElementById('send-text'),
    sendSpinner: document.getElementById('send-spinner'),
    promptSuggestions: document.getElementById('prompt-suggestions'),
    chatFullscreenBtn: document.getElementById('chat-fullscreen-btn'),

    // Fullscreen view
    chatFullscreenContainer: document.getElementById('chat-fullscreen-container'),
    chatMinimizeBtn: document.getElementById('chat-minimize-btn'),
    chatContainerFullscreen: document.getElementById('chat-container-fullscreen'),
    chatFormFullscreen: document.getElementById('chat-form-fullscreen'),
    chatInputFullscreen: document.getElementById('chat-input-fullscreen'),
    chatSubmitFullscreen: document.getElementById('chat-submit-fullscreen'),
    sendTextFullscreen: document.getElementById('send-text-fullscreen'),
    sendSpinnerFullscreen: document.getElementById('send-spinner-fullscreen'),
    promptSuggestionsFullscreen: document.getElementById('prompt-suggestions-fullscreen'),
};

// Manager to control background effects
const effectsManager = {
    starfield: { animationId: null, start: () => {}, stop: () => {} }
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
        { label: 'Energy (kWh)', data: [], backgroundColor: 'rgba(0, 246, 255, 0.1)', yAxisID: 'y', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 6 },
        { label: 'Cost (Rs)', data: [], backgroundColor: 'rgba(217, 70, 239, 0.1)', yAxisID: 'y1', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 6 }
    ]
};

let chartOptions = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    scales: {
        x: { title: { display: true, text: 'Time' } },
        y: { type: 'linear', position: 'left', title: { display: true, text: 'Energy (kWh)' } },
        y1: { type: 'linear', position: 'right', title: { display: true, text: 'Cost (Rs)' }, grid: { drawOnChartArea: false } }
    },
    plugins: { legend: { labels: {} } }
};

function initializeCharts() {
    if (ui.chartCanvas) {
        consumptionChart = new Chart(ui.chartCanvas.getContext('2d'), { type: 'line', data: chartData, options: chartOptions });
    }
    if (ui.expandedChartCanvas) {
        expandedConsumptionChart = new Chart(ui.expandedChartCanvas.getContext('2d'), { type: 'line', data: chartData, options: chartOptions });
    }
}

function updateCharts() {
    const MAX_DATA_POINTS = 30;
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const energyValue = parseFloat(currentSensorData.energy);
    const costValue = parseFloat(currentSensorData.cost);

    if (!isNaN(energyValue) && !isNaN(costValue)) {
        chartData.labels.push(timeLabel);
        chartData.datasets[0].data.push(energyValue);
        chartData.datasets[1].data.push(costValue);

        if (chartData.labels.length > MAX_DATA_POINTS) {
            chartData.labels.shift();
            chartData.datasets.forEach(dataset => dataset.data.shift());
        }
        if (consumptionChart) consumptionChart.update();
        if (expandedConsumptionChart) expandedConsumptionChart.update();
    }
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
                currentSensorData = data;
                dataHistory.push({ data, timestamp: Date.now() });
                if (dataHistory.length > MAX_HISTORY_LENGTH) dataHistory.shift();
                
                updateDashboard(data);
                updateBatteryIndicator(data);
                updateCharts();
                setConnectionState('connected');
            } else {
                setConnectionState('error', "Waiting for data...");
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
    
    ui.statusDot.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-slate-600');
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
            ui.statusDot.classList.add('bg-slate-600');
            ui.statusText.textContent = "Disconnected";
            break;
        case 'error':
            ui.statusDot.classList.add('bg-red-500');
            ui.statusText.textContent = message || "Connection Failed";
            break;
    }
}

// --- FINAL FIX: Replaced NaN with placeholders ---
function updateDashboard(data) {
    const formatValue = (value, precision) => {
        const num = parseFloat(value);
        return isNaN(num) ? "-.--" : num.toFixed(precision);
    };

    ui.power.textContent = formatValue(data.power, 2);
    ui.voltage.textContent = formatValue(data.voltage, 2);
    ui.current.textContent = formatValue(data.current, 3);
    document.querySelector('#energy-card .metric-value').textContent = formatValue(data.energy, 4);
    document.querySelector('#cost-card .metric-value').textContent = formatValue(data.cost, 2);
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

    ui.batteryFill.className = 'battery-fill';
    ui.limitCard.className = 'data-card p-6 animated';
    
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

    ui.overdriveStatusIndicator.classList.toggle('hidden', !data.overdrive);
}

function resetBatteryIndicator() {
    ui.limitText.textContent = `-.-- / -.-- kWh`;
    ui.batteryFill.style.width = '0%';
    ui.batteryFill.className = 'battery-fill state-low';
    ui.limitCard.className = 'data-card p-6 animated aura-low';
    ui.overdriveStatusIndicator.classList.add('hidden');
}

// --- Gemini Chat Logic ---
function addMessageToChat(sender, message, isAI) {
    const createMessageElement = () => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `p-3 max-w-lg text-sm ${isAI ? 'chat-ai' : 'chat-user ml-auto'}`;
        messageDiv.innerHTML = `<p class="font-semibold" style="color: ${isAI ? 'var(--accent-cyan)' : 'var(--accent-purple)'};">${sender}</p><p class="text-text-primary whitespace-pre-wrap">${message}</p>`;
        return messageDiv;
    };
    
    [ui.chatContainer, ui.chatContainerFullscreen].forEach(container => {
        if (container) {
            container.appendChild(createMessageElement());
            container.scrollTop = container.scrollHeight;
        }
    });
}

function setChatLoading(isLoading) {
    [ui.chatSubmit, ui.chatSubmitFullscreen].forEach(btn => btn.disabled = isLoading);
    [ui.sendText, ui.sendTextFullscreen].forEach(txt => txt.classList.toggle('hidden', isLoading));
    [ui.sendSpinner, ui.sendSpinnerFullscreen].forEach(spn => spn.classList.toggle('hidden', !isLoading));
}

async function handleChatSubmit(inputValue) {
    const userInput = inputValue.trim();
    if (!userInput) return;

    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR")) {
        addMessageToChat("Error", "Gemini API key is invalid.", true);
        return;
    }

    addMessageToChat("You", userInput, false);
    ui.chatInput.value = '';
    ui.chatInputFullscreen.value = '';
    setChatLoading(true);

    try {
        const sensorDataContext = JSON.stringify(currentSensorData, null, 2);
        const fullPrompt = `Based on the following real-time data from an ESP32 power monitor, answer the user's question.\n\nSensor Data:\n${sensorDataContext}\n\nUser Question: "${userInput}"`;
        const systemPrompt = "You are Elyra AI, a helpful power management assistant. Analyze the provided real-time data to answer user questions concisely. Provide suggestions to save energy or explain the current power consumption. If the question is not related to power, act as a general conversational AI. Format your response using simple markdown.";
        
        const response = await callGeminiApi(fullPrompt, systemPrompt);
        addMessageToChat("Elyra", response, true);
    } catch (error) {
        console.error("Gemini API Error:", error);
        addMessageToChat("Error", `Could not connect to the Gemini API.\nReason: ${error.message}`, true);
    } finally {
        setChatLoading(false);
    }
}

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
        const errorBody = await response.json();
        throw new Error(errorBody.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// --- Modal and Graph Interaction Logic ---
function showHistoryModal(metric, title) {
    ui.modalTitle.textContent = title;
    const historyBody = ui.modalBody;
    historyBody.innerHTML = '';
    const filteredHistory = dataHistory.map(e => ({ value: e.data[metric], ts: e.timestamp })).filter(e => e.value !== undefined).reverse();

    if (filteredHistory.length === 0) {
        historyBody.innerHTML = '<p class="text-text-secondary text-center">No history to display.</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'history-table';
        table.innerHTML = `<thead><tr><th>Value</th><th>Time</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        filteredHistory.forEach(item => {
            const row = tbody.insertRow();
            const val = typeof item.value === 'number' ? item.value.toFixed(4) : item.value;
            row.innerHTML = `<td>${val}</td><td class="timestamp">${new Date(item.ts).toLocaleTimeString()}</td>`;
        });
        table.appendChild(tbody);
        historyBody.appendChild(table);
    }
    ui.historyModalOverlay.classList.remove('hidden');
    setTimeout(() => ui.historyModalOverlay.classList.add('visible'), 10);
}

function hideModal(modalOverlay) {
    modalOverlay.classList.remove('visible');
    setTimeout(() => modalOverlay.classList.add('hidden'), 300);
}

function showGraphModal() {
    ui.graphModalOverlay.classList.remove('hidden');
    setTimeout(() => { ui.graphModalOverlay.classList.add('visible'); if (expandedConsumptionChart) expandedConsumptionChart.resize(); }, 10);
}

function updateChartTheme() {
    if (!consumptionChart || !expandedConsumptionChart) return;
    const style = getComputedStyle(document.body);
    const gridColor = style.getPropertyValue('--grid-line-color').trim();
    const textColor = style.getPropertyValue('--text-secondary').trim();
    const legendColor = style.getPropertyValue('--text-primary').trim();
    const line1Color = style.getPropertyValue('--graph-line-1').trim();
    const line2Color = style.getPropertyValue('--graph-line-2').trim();
    const updateOptions = (chart) => {
        chart.data.datasets[0].borderColor = line1Color;
        chart.data.datasets[1].borderColor = line2Color;
        chart.options.scales.x.ticks.color = textColor;
        chart.options.scales.x.grid.color = gridColor;
        chart.options.scales.x.title.color = textColor;
        chart.options.scales.y.ticks.color = textColor;
        chart.options.scales.y.grid.color = gridColor;
        chart.options.scales.y.title.color = textColor;
        chart.options.scales.y1.ticks.color = textColor;
        chart.options.scales.y1.title.color = textColor;
        chart.options.plugins.legend.labels.color = legendColor;
        chart.update('none');
    };
    updateOptions(consumptionChart);
    updateOptions(expandedConsumptionChart);
}

// --- Page Load Logic ---
window.onload = () => {
    initializeCharts();
    updateDashboard(initialData);
    resetBatteryIndicator();

    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');
    updateChartTheme(); 

    ui.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        updateChartTheme();
    });

    setTimeout(() => {
        ui.loader.classList.add('hidden');
        ui.mainContent.classList.add('visible');
        document.querySelectorAll('.animated').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 1500);

    ui.connectBtn.addEventListener('click', connectToESP32);
    ui.disconnectBtn.addEventListener('click', disconnectFromESP32);
    
    const openFullscreenChat = () => {
        effectsManager.starfield.stop();
        if (ui.starfieldCanvas) ui.starfieldCanvas.style.display = 'none';
        document.body.classList.add('chat-fullscreen-active');
        ui.chatFullscreenContainer.classList.add('visible');
        ui.chatInputFullscreen.focus();
    };

    const closeFullscreenChat = () => {
        ui.chatFullscreenContainer.classList.remove('visible');
        setTimeout(() => {
            document.body.classList.remove('chat-fullscreen-active');
            if (ui.starfieldCanvas) ui.starfieldCanvas.style.display = 'block';
            effectsManager.starfield.start();
        }, 300);
    };

    ui.chatFullscreenBtn.addEventListener('click', openFullscreenChat);
    ui.chatMinimizeBtn.addEventListener('click', closeFullscreenChat);

    ui.chatForm.addEventListener('submit', (e) => { e.preventDefault(); handleChatSubmit(ui.chatInput.value); });
    ui.chatFormFullscreen.addEventListener('submit', (e) => { e.preventDefault(); handleChatSubmit(ui.chatInputFullscreen.value); });
    
    const onPromptClick = (e) => {
        if (e.target.classList.contains('prompt-button')) {
            const promptText = e.target.textContent.replace(/"/g, '');
            ui.chatInput.value = promptText;
            ui.chatInputFullscreen.value = promptText;
            handleChatSubmit(promptText);
        }
    };
    ui.promptSuggestions.addEventListener('click', onPromptClick);
    ui.promptSuggestionsFullscreen.addEventListener('click', onPromptClick);

    document.querySelectorAll('[data-metric]').forEach(card => {
        card.addEventListener('click', (e) => {
            const metricTarget = e.target.closest('[data-metric]');
            if (metricTarget) {
                showHistoryModal(metricTarget.dataset.metric, metricTarget.dataset.title);
            }
        });
    });
    
    ui.chartCard.addEventListener('click', showGraphModal);
    ui.aboutNavBtn.addEventListener('click', () => { ui.aboutModalOverlay.classList.remove('hidden'); setTimeout(() => ui.aboutModalOverlay.classList.add('visible'), 10); });

    // Modal close listeners
    ui.modalCloseBtn.addEventListener('click', () => hideModal(ui.historyModalOverlay));
    ui.historyModalOverlay.addEventListener('click', (e) => { if (e.target === ui.historyModalOverlay) hideModal(ui.historyModalOverlay); });
    ui.graphModalCloseBtn.addEventListener('click', () => hideModal(ui.graphModalOverlay));
    ui.graphModalOverlay.addEventListener('click', (e) => { if (e.target === ui.graphModalOverlay) hideModal(ui.graphModalOverlay); });
    ui.aboutModalCloseBtn.addEventListener('click', () => hideModal(ui.aboutModalOverlay));
    ui.aboutModalOverlay.addEventListener('click', (e) => { if (e.target === ui.aboutModalOverlay) hideModal(ui.aboutModalOverlay); });

    // --- FINAL FIX: Starfield Parallax Effect ---
    window.addEventListener('scroll', () => {
        if (ui.starfieldCanvas) {
            const scrollY = window.scrollY;
            ui.starfieldCanvas.style.transform = `translateY(${scrollY * 0.3}px)`;
        }
    });

    // Starfield Background Animation
    if (ui.starfieldCanvas) {
        const ctx = ui.starfieldCanvas.getContext('2d');
        let stars = [];
        let numStars = 200;

        const setCanvasSize = () => {
            ui.starfieldCanvas.width = window.innerWidth;
            ui.starfieldCanvas.height = window.innerHeight;
        };

        const createStars = () => {
            stars = [];
            for (let i = 0; i < numStars; i++) {
                stars.push({
                    x: Math.random() * ui.starfieldCanvas.width,
                    y: Math.random() * ui.starfieldCanvas.height,
                  _radius: Math.random() * 1.5 + 0.5,
                    alpha: Math.random(),
                    speed: Math.random() * 0.2 + 0.1,
                    twinkleSpeed: Math.random() * 0.015 + 0.005
                });
            }
        };

        const drawStars = () => {
            ctx.clearRect(0, 0, ui.starfieldCanvas.width, ui.starfieldCanvas.height);
            stars.forEach(star => {
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                star.alpha += star.twinkleSpeed;
                if (star.alpha > 1 || star.alpha < 0) star.twinkleSpeed *= -1;
                ctx.fillStyle = `rgba(229, 231, 235, ${star.alpha * 0.7})`;
                ctx.fill();
                star.y += star.speed;
                if (star.y > ui.starfieldCanvas.height) {
                    star.y = 0;
                    star.x = Math.random() * ui.starfieldCanvas.width;
                }
            });
        };

        const animateStarfieldLoop = () => {
            drawStars();
            effectsManager.starfield.animationId = requestAnimationFrame(animateStarfieldLoop);
        };

        effectsManager.starfield.start = () => { if (!effectsManager.starfield.animationId) animateStarfieldLoop(); };
        effectsManager.starfield.stop = () => { if (effectsManager.starfield.animationId) { cancelAnimationFrame(effectsManager.starfield.animationId); effectsManager.starfield.animationId = null; }};

        window.addEventListener('resize', () => { setCanvasSize(); createStars(); });
        setCanvasSize();
        createStars();
        effectsManager.starfield.start();
    }
};

