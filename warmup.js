const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const nacl = require('tweetnacl');
const nutil = require('tweetnacl-util');

chromium.use(stealthPlugin);

// =====================================================================
// 💬 THE 2,000 CHAT BOX MATRIX (Rich with human conversational emojis)
// =====================================================================
const CHAT_MATRIX = [
    "Hey! Hope your morning is starting off amazing ☀️✨",
    "Did you get a chance to look at that update I sent over yesterday? 🤔💬",
    "Let me know when you are free for a quick voice call later today 📞👀",
    "Just making sure this connection is working properly on this end! ⚡✅",
    "Heading out to grab some coffee ☕ I will be back at the desk in ten!",
    "Are we still on for our project synchronization meeting this afternoon? 👨‍💻🔥",
    "Thanks for updating those tracking sheets, looks absolutely flawless! 💯🙌",
    "Let's definitely catch up over lunch today if you have some free time 🍕😎",
    "Can you double-check the logistics delivery status on your end? 📦🚀",
    "Perfect! I will pass this updated information along to the main team right away 🤝🌟",
    "Hello there! Wishing you a super productive and smooth day ahead 💫🚀",
    "Quick question about the details we discussed earlier, let me know when free 💬👇",
    "Wow, that turned out way better than expected! Brilliant work 🎨🔥",
    "Just checking in to see if you need any assistance with those files today 🤝💼",
    "Can we jump on a brief screen-share session whenever you take your next break? 🖥️🕒"
];

// --- GENERATE / ADD REMAINING CONVERSATIONAL PHASES ---
// This loop automatically duplicates variations up to 2000 instances to ensure 
// a massive pool footprint if you launch the template with your main lists empty.
const originalLength = CHAT_MATRIX.length;
while (CHAT_MATRIX.length < 2000) {
    let index = CHAT_MATRIX.length;
    let baseMsg = CHAT_MATRIX[index % originalLength];
    // Modifies strings slightly with unique identifiers so no two messages are identical strings
    CHAT_MATRIX.push(`${baseMsg} [id:${index + 1000}] ✨`);
}

const SESSION_BASE_DIR = path.join(__dirname, 'session_folders');
const LOG_FILE_PATH = path.join(SESSION_BASE_DIR, 'history_matrix.json');

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const randomRange = (min, max) => Math.random() * (max - min) + min;

// =====================================================================
// 📊 CONVERSATIONAL MEMORY CONTROL (Tracks Yesterday's Interaction Logs)
// =====================================================================
function loadHistoryLogs() {
    if (fs.existsSync(LOG_FILE_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(LOG_FILE_PATH, 'utf-8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveHistoryLogs(historyData) {
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(historyData, null, 2), 'utf-8');
}

function selectTargetsForToday(accountKey, allPhones) {
    const logs = loadHistoryLogs();
    const pastContacts = logs[accountKey] || [];
    
    let targetsForToday = [];

    if (pastContacts.length === 0) {
        // DAY 1 STRUCTURE: Pick exactly 10 brand new contacts completely at random
        const shuffled = [...allPhones].sort(() => 0.5 - Math.random());
        targetsForToday = shuffled.slice(0, Math.min(10, shuffled.length));
    } else {
        // DAY 2+ STRUCTURE: Pick 5 from yesterday's history + 5 brand-new ones
        const shuffledPast = [...pastContacts].sort(() => 0.5 - Math.random());
        const pickedOld = shuffledPast.slice(0, Math.min(5, shuffledPast.length));
        
        const freshPool = allPhones.filter(p => !pastContacts.includes(p));
        const shuffledFresh = freshPool.sort(() => 0.5 - Math.random());
        const pickedNew = shuffledFresh.slice(0, Math.min(5, shuffledFresh.length));
        
        targetsForToday = [...pickedOld, ...pickedNew];
        
        // If your rolling targets ever max out the total list, continue charting 10 existing per day
        if (targetsForToday.length < 10 && allPhones.length >= 10) {
            const fillPool = allPhones.filter(p => !targetsForToday.includes(p));
            const extraPicks = fillPool.sort(() => 0.5 - Math.random()).slice(0, 10 - targetsForToday.length);
            targetsForToday = [...targetsForToday, ...extraPicks];
        }
    }

    const updatedHistory = Array.from(new Set([...pastContacts, ...targetsForToday]));
    logs[accountKey] = updatedHistory;
    saveHistoryLogs(logs);

    return targetsForToday;
}

// =====================================================================
// 🔒 SECURE RE-ENCRYPTION & STORAGE LAYER
// =====================================================================
function unpackSessions(secretData) {
    if (!fs.existsSync(SESSION_BASE_DIR)) fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    if (!secretData || secretData === "INITIAL_EMPTY_STATE") {
        console.log("ℹ dependency parameters verified. Booting clean database instance.");
        return false;
    }
    try {
        const compressedBuffer = Buffer.from(secretData, 'base64');
        const jsonBuffer = zlib.inflateSync(compressedBuffer);
        const stateDict = JSON.parse(jsonBuffer.toString('utf-8'));
        
        for (const [filePath, fileContent] of Object.entries(stateDict)) {
            const fullPath = path.join(SESSION_BASE_DIR, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, fileContent, 'utf-8');
        }
        console.log("✅ Session storage states unpacked successfully.");
        return true;
    } catch (e) {
        console.log(`⚠️ Failed to unpack sessions: ${e.message}. Starting fresh.`);
        return false;
    }
}

async function updateGithubSecret(secretName, rawValue) {
    const ghToken = process.env.GH_TOKEN;
    const repoName = process.env.REPO_NAME;
    if (!ghToken || !repoName) return;

    const headers = {
        "Authorization": `token ${ghToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "NodeJS-App"
    };

    const keyUrl = `https://github.com{repoName}/actions/secrets/public-key`;
    const res = await fetch(keyUrl, { headers });
    const publicKeyData = await res.json();
    
    const messageUint8 = nutil.decodeUTF8(rawValue);
    const pubKeyUint8 = nutil.decodeBase64(publicKeyData.key);
    const encryptedUint8 = nacl.sealedBox.encrypt(messageUint8, pubKeyUint8);
    const encryptedString = nutil.encodeBase64(encryptedUint8);

    const secretUrl = `https://github.com{repoName}/actions/secrets/${secretName}`;
    await fetch(secretUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ encrypted_value: encryptedString, key_id: publicKeyData.key_id })
    });
}

async function packAndUploadSessions() {
    const stateDict = {};
    if (!fs.existsSync(SESSION_BASE_DIR)) return;

    function walkSync(currentDir) {
        fs.readdirSync(currentDir).forEach(file => {
            const fullPath = path.join(currentDir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                walkSync(fullPath);
            } else {
                const relPath = path.relative(SESSION_BASE_DIR, fullPath);
                try {
                    stateDict[relPath] = fs.readFileSync(fullPath, 'utf-8');
                } catch (e) {}
            }
        });
    }
    
    walkSync(SESSION_BASE_DIR);
    if (Object.keys(stateDict).length === 0) return;

    const jsonStr = JSON.stringify(stateDict);
    const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf-8'));
    await updateGithubSecret("WHATSAPP_SESSIONS", compressed.toString('base64'));
    console.log("📤 Advanced multi-thread session cookies and history maps archived to GitHub.");
}

// =====================================================================
// 🧵 WORKER THREAD ENGINE (With Custom Pause & Cooldown Modifiers)
// =====================================================================
async function warmUpAccount(accountIndex, currentPhone, proxyStr, allPhones) {
    const targets = selectTargetsForToday(`acc_${accountIndex}`, allPhones);
    console.log(`⚙️ Thread Activated: WhatsApp ${accountIndex} routing messages to ${targets.length} targets...`);
    
    let proxyConfig = undefined;
    if (proxyStr && proxyStr.includes('@')) {
        try {
            const parts = proxyStr.split('@');
            const server = parts;
            const creds = parts.replace('http://', '').replace('https://', '').split(':');
            proxyConfig = { server: `http://${server}`, username: creds, password: creds };
        } catch (e) {}
    }

    const userDataPath = path.join(SESSION_BASE_DIR, `acc_${accountIndex}`);
    
    try {
        const context = await chromium.launchPersistentContext(userDataPath, {
            headless: true,
            proxy: proxyConfig,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1280,720'
            ]
        });

        const page = await context.newPage();

        for (const targetPhone of targets) {
            const chatUrl = `https://whatsapp.com{targetPhone}&text&type=phone_number&app_absent=0`;
            try {
                await page.goto(chatUrl, { timeout: 50000 });
                
                const inputSelector = 'div[contenteditable="true"] >> nth=1';
                await page.waitForSelector(inputSelector, { timeout: 45000 });

