// Use relative URL so it works both locally and on Vercel
const API_URL = window.location.origin + '/api';

// DOM Elements
const urlInput = document.getElementById('urlInput');
const locationSelect = document.getElementById('locationSelect');
const headlessToggle = document.getElementById('headlessToggle');
const startBtn = document.getElementById('startBtn');

const progressSection = document.getElementById('progressSection');
const statusBadge = document.getElementById('statusBadge');
const progressLog = document.getElementById('progressLog');
const progressFill = document.getElementById('progressFill');

const resultsSection = document.getElementById('resultsSection');
const resultCount = document.getElementById('resultCount');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const homepageSection = document.getElementById('homepageSection');
const homepageGrid = document.getElementById('homepageGrid');
const promotionsSection = document.getElementById('promotionsSection');
const promotionsGrid = document.getElementById('promotionsGrid');
const emptyState = document.getElementById('emptyState');

const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

let currentSessionId = null;
let pollInterval = null;
let allBanners = [];

// Event Listeners
startBtn.addEventListener('click', startScraping);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startScraping();
});
downloadAllBtn.addEventListener('click', downloadAllUrls);

async function startScraping() {
    const url = urlInput.value.trim();
    const location = parseInt(locationSelect.value);
    const headless = headlessToggle.checked;

    // Reset UI
    hideAllSections();
    clearResults();

    // Validate URL
    if (!url) {
        showError('Please enter a website URL');
        return;
    }

    try {
        new URL(url);
    } catch {
        showError('Please enter a valid URL (include http:// or https://)');
        return;
    }

    // Disable button
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    try {
        // Start scraping session
        const response = await fetch(`${API_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, location, headless })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start scraping');
        }

        currentSessionId = data.sessionId;
        console.log(`Session started: ${currentSessionId}`);

        // Show progress section
        progressSection.classList.remove('hidden');
        statusBadge.textContent = 'Running...';
        statusBadge.className = 'status-badge running';
        progressFill.style.width = '30%';

        // Start polling for updates
        pollSession();

    } catch (error) {
        showError(error.message);
        resetButton();
    }
}

function pollSession() {
    if (!currentSessionId) return;

    // Poll every 2 seconds
    pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/scrape/${currentSessionId}`);
            const data = await response.json();

            // Update progress log
            updateProgressLog(data.progress);

            // Check status
            if (data.status === 'completed') {
                clearInterval(pollInterval);
                handleCompletion(data);
            } else if (data.status === 'error') {
                clearInterval(pollInterval);
                handleError(data.error);
            } else {
                // Still running
                progressFill.style.width = '60%';
            }

        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 2000);
}

function updateProgressLog(progressItems) {
    if (!progressItems || progressItems.length === 0) return;

    // Only add new items
    const currentCount = progressLog.children.length;
    const newItems = progressItems.slice(currentCount);

    newItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'progress-log-item';
        div.textContent = item.message;
        progressLog.appendChild(div);
    });

    // Auto-scroll to bottom
    progressLog.scrollTop = progressLog.scrollHeight;
}

function handleCompletion(data) {
    console.log('Scraping completed:', data);

    progressFill.style.width = '100%';
    statusBadge.textContent = 'Completed';
    statusBadge.className = 'status-badge completed';

    // Display results
    displayResults(data.results);

    resetButton();
}

function handleError(error) {
    console.error('Scraping failed:', error);

    statusBadge.textContent = 'Failed';
    statusBadge.className = 'status-badge error';

    showError(error);
    resetButton();
}

function displayResults(results) {
    if (!results) {
        showError('No results returned from scraper');
        return;
    }

    const homepageBanners = results.homepage || [];
    const promotionsBanners = results.promotions || [];
    allBanners = [...homepageBanners, ...promotionsBanners];

    const totalCount = allBanners.length;

    if (totalCount === 0) {
        resultsSection.classList.remove('hidden');
        emptyState.classList.remove('hidden');
        homepageSection.classList.add('hidden');
        promotionsSection.classList.add('hidden');
        return;
    }

    // Show results section
    resultsSection.classList.remove('hidden');
    emptyState.classList.add('hidden');
    resultCount.textContent = `${totalCount} banner${totalCount === 1 ? '' : 's'} found`;

    // Display homepage banners
    if (homepageBanners.length > 0) {
        homepageSection.classList.remove('hidden');
        homepageGrid.innerHTML = homepageBanners.map((banner, idx) =>
            createBannerCard(banner, `homepage-${idx}`)
        ).join('');
    } else {
        homepageSection.classList.add('hidden');
    }

    // Display promotions banners
    if (promotionsBanners.length > 0) {
        promotionsSection.classList.remove('hidden');
        promotionsGrid.innerHTML = promotionsBanners.map((banner, idx) =>
            createBannerCard(banner, `promo-${idx}`)
        ).join('');
    } else {
        promotionsSection.classList.add('hidden');
    }
}

function createBannerCard(banner, id) {
    return `
        <div class="banner-card" id="${id}">
            <img
                src="${banner.src}"
                alt="${banner.alt || 'Banner image'}"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3EImage Load Error%3C/text%3E%3C/svg%3E'"
            >
            <div class="banner-info">
                <h4>${banner.type || 'Banner Image'}</h4>
                <p class="banner-url">${banner.src}</p>
                <a href="${banner.src}" target="_blank" class="banner-download" download>
                    Download Image
                </a>
            </div>
        </div>
    `;
}

function downloadAllUrls() {
    if (allBanners.length === 0) return;

    const urls = allBanners.map(b => b.src).join('\n');
    const blob = new Blob([urls], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `banner-urls-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showError(message) {
    errorSection.classList.remove('hidden');
    errorMessage.textContent = message;
}

function hideAllSections() {
    progressSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorSection.classList.add('hidden');
}

function clearResults() {
    progressLog.innerHTML = '';
    progressFill.style.width = '0%';
    homepageGrid.innerHTML = '';
    promotionsGrid.innerHTML = '';
    allBanners = [];
}

function resetButton() {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">🚀</span> Start Scraping';
}
