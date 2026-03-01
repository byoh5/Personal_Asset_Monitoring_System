(() => {
  const STORAGE = {
    theme: 'asset_monitoring-theme',
    lastFile: 'asset_monitoring-web-last-file-meta',
    snapshot: 'asset_monitoring-web-snapshot-v1',
    analysisProfile: 'asset_monitoring-web-analysis-profile-v1',
    analysisAiEndpoint: 'asset_monitoring-web-analysis-ai-endpoint-v1',
  };

  const ASSET_TYPE_LABELS = {
    stock: '주식',
    etf: 'ETF',
    deposit: '예금',
    cash: '현금',
    gold: '금',
    real_estate: '부동산',
    crypto: '가상자산',
    bond: '채권',
    fund: '펀드',
    pension: '연금',
    insurance: '보험',
    liability: '부채',
    other: '기타',
  };

  const ASSET_TYPE_ALIASES = {
    realestate: 'real_estate',
    'real estate': 'real_estate',
    real_estate: 'real_estate',
    loan: 'liability',
    debt: 'liability',
    stock: 'stock',
    etf: 'etf',
    deposit: 'deposit',
    cash: 'cash',
    gold: 'gold',
    crypto: 'crypto',
    bond: 'bond',
    fund: 'fund',
    pension: 'pension',
    insurance: 'insurance',
    liability: 'liability',
    other: 'other',
    주식: 'stock',
    예금: 'deposit',
    현금: 'cash',
    금: 'gold',
    부동산: 'real_estate',
    가상자산: 'crypto',
    채권: 'bond',
    펀드: 'fund',
    연금: 'pension',
    보험: 'insurance',
    대출: 'liability',
    부채: 'liability',
    기타: 'other',
  };

  const CURRENCY_OPTIONS = ['KRW', 'USD', 'EUR', 'JPY', 'CNY', 'HKD'];
  const MARKET_OPTION_TYPES = ['stock', 'etf', 'crypto', 'fund', 'bond'];
  const BANK_OPTION_TYPES = ['deposit', 'pension', 'insurance', 'liability'];
  const DEFAULT_OPENAI_REPORT_ENDPOINT = 'https://personal-asset-monitoring-system.vercel.app/api/openai-asset-report';

  const PiePercentLabelPlugin = {
    id: 'piePercentLabel',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      const chartType = String(chart?.config?.type || '').toLowerCase();
      if (!['pie', 'doughnut'].includes(chartType)) return;
      if (!chart || !chart.data || !Array.isArray(chart.data.datasets) || !chart.data.datasets.length) return;

      const dataset = chart.data.datasets[0];
      const rawData = Array.isArray(dataset.data) ? dataset.data : [];
      const values = rawData.map((value) => Number(value || 0));
      const total = values.reduce((sum, value) => (Number.isFinite(value) && value > 0 ? sum + value : sum), 0);
      if (!total) return;

      const options = pluginOptions || {};
      const minPercent = Number(options.minPercent ?? 3);
      const fontSize = Number(options.fontSize ?? 14);
      const fillColor = options.color || '#f8fafc';
      const strokeColor = options.strokeColor || 'rgba(15, 23, 42, 0.7)';
      const strokeWidth = Number(options.strokeWidth ?? 3);

      const meta = chart.getDatasetMeta(0);
      if (!meta || !Array.isArray(meta.data)) return;

      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';

      meta.data.forEach((arc, index) => {
        const value = values[index];
        if (!(value > 0)) return;
        const percent = (value / total) * 100;
        if (percent < minPercent) return;

        const position = typeof arc.tooltipPosition === 'function' ? arc.tooltipPosition() : null;
        if (!position) return;

        const label = `${percent.toFixed(0)}%`;
        if (strokeWidth > 0) ctx.strokeText(label, position.x, position.y);
        ctx.fillText(label, position.x, position.y);
      });
      ctx.restore();
    },
  };

  if (typeof Chart !== 'undefined' && typeof Chart.register === 'function') {
    Chart.register(PiePercentLabelPlugin);
  }

  const ThemeManager = {
    init() {
      const saved = localStorage.getItem(STORAGE.theme) || 'dark';
      this.setTheme(saved);
    },

    getTheme() {
      return document.documentElement.getAttribute('data-theme') || 'light';
    },

    setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE.theme, theme);
      this.updateIcon();
    },

    toggle() {
      const next = this.getTheme() === 'dark' ? 'light' : 'dark';
      this.setTheme(next);
    },

    updateIcon() {
      const btn = document.getElementById('themeToggle');
      if (!btn) return;
      const isDark = this.getTheme() === 'dark';
      btn.innerHTML = isDark ? '☀️' : '🌙';
      btn.title = isDark ? '라이트 테마' : '다크 테마';
    },
  };

  const App = {
    currentPage: 'dashboard',
    breakdownChart: null,
    analysisAllocChart: null,
    state: {
      assets: [],
      dashboard: null,
      fileMeta: null,
      message: '',
      messageType: 'info',
      filterText: '',
      filterType: 'all',
      jsonDraft: '',
      jsonPreviewRows: [],
      jsonPreviewSummary: null,
      jsonValidRows: [],
      jsonStatus: '',
      jsonStatusType: 'info',
      manualAssetDraft: {
        name: '',
        type: 'stock',
        valuation: '',
        currency: 'KRW',
        ticker: '',
        market: '',
        owner: '',
        quantity: '',
        manualPrice: '',
        bankName: '',
        accountNumber: '',
        interestRatePct: '',
        maturityDate: '',
      },
      manualAssetError: '',
      analysisProfile: null,
      analysisReport: null,
      analysisAiEndpoint: DEFAULT_OPENAI_REPORT_ENDPOINT,
      analysisAiReport: null,
      analysisAiStatus: '',
      analysisAiStatusType: 'info',
      analysisAiLoading: false,
    },

    menuItems: [
      { id: 'dashboard', icon: '📊', label: '대시보드' },
      { id: 'assets', icon: '💼', label: '자산' },
      { id: 'analysis', icon: '🧭', label: '자산 분석' },
      { id: 'manual', icon: '📘', label: '매뉴얼' },
      { id: 'info', icon: 'ℹ️', label: '정보' },
    ],

    init() {
      ThemeManager.init();
      this.loadFileMeta();
      this.loadDataSnapshot();
      this.loadAnalysisProfile();
      this.loadAnalysisAiEndpoint();
      this.renderLayout();
      this.bindLayoutEvents();
      this.renderPage('dashboard');
      this.renderDataToolbar();
    },

    loadFileMeta() {
      try {
        const raw = localStorage.getItem(STORAGE.lastFile);
        this.state.fileMeta = raw ? JSON.parse(raw) : null;
      } catch (error) {
        console.warn('Failed to load file metadata:', error);
        this.state.fileMeta = null;
      }
    },

    saveFileMeta(meta) {
      this.state.fileMeta = meta;
      localStorage.setItem(STORAGE.lastFile, JSON.stringify(meta));
    },

    loadDataSnapshot() {
      try {
        const raw = localStorage.getItem(STORAGE.snapshot);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
        const dashboard = parsed.dashboard && typeof parsed.dashboard === 'object'
          ? parsed.dashboard
          : this.buildDashboard(assets, null);

        if (!assets.length && !dashboard) return;

        this.state.assets = assets;
        this.state.dashboard = dashboard;
        if (!this.state.fileMeta && parsed.fileMeta && typeof parsed.fileMeta === 'object') {
          this.state.fileMeta = parsed.fileMeta;
        }

        const savedAt = this.formatTimestamp(parsed.savedAt);
        this.state.message = savedAt && savedAt !== '-'
          ? `최근 작업 데이터를 자동 복원했습니다. (${savedAt})`
          : '최근 작업 데이터를 자동 복원했습니다.';
        this.state.messageType = 'info';
      } catch (error) {
        console.warn('Failed to load snapshot:', error);
      }
    },

    saveDataSnapshot() {
      try {
        const payload = {
          version: 1,
          savedAt: new Date().toISOString(),
          assets: this.state.assets || [],
          dashboard: this.state.dashboard || null,
          fileMeta: this.state.fileMeta || null,
        };
        localStorage.setItem(STORAGE.snapshot, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to save snapshot:', error);
      }
    },

    clearDataSnapshot() {
      try {
        localStorage.removeItem(STORAGE.snapshot);
      } catch (error) {
        console.warn('Failed to clear snapshot:', error);
      }
    },

    loadAnalysisProfile() {
      try {
        const raw = localStorage.getItem(STORAGE.analysisProfile);
        if (!raw) {
          this.state.analysisProfile = this.getDefaultAnalysisProfile();
          return;
        }
        const parsed = JSON.parse(raw);
        this.state.analysisProfile = {
          ...this.getDefaultAnalysisProfile(),
          ...(parsed && typeof parsed === 'object' ? parsed : {}),
        };
      } catch (error) {
        console.warn('Failed to load analysis profile:', error);
        this.state.analysisProfile = this.getDefaultAnalysisProfile();
      }
    },

    saveAnalysisProfile(profile) {
      const normalized = {
        ...this.getDefaultAnalysisProfile(),
        ...(profile && typeof profile === 'object' ? profile : {}),
      };
      this.state.analysisProfile = normalized;
      try {
        localStorage.setItem(STORAGE.analysisProfile, JSON.stringify(normalized));
      } catch (error) {
        console.warn('Failed to save analysis profile:', error);
      }
    },

    loadAnalysisAiEndpoint() {
      try {
        const raw = localStorage.getItem(STORAGE.analysisAiEndpoint);
        const normalized = this.normalizeAnalysisAiEndpoint(raw);
        this.state.analysisAiEndpoint = normalized || DEFAULT_OPENAI_REPORT_ENDPOINT;
      } catch (error) {
        console.warn('Failed to load analysis AI endpoint:', error);
        this.state.analysisAiEndpoint = DEFAULT_OPENAI_REPORT_ENDPOINT;
      }
    },

    saveAnalysisAiEndpoint(value) {
      const normalized = this.normalizeAnalysisAiEndpoint(value);
      this.state.analysisAiEndpoint = normalized || DEFAULT_OPENAI_REPORT_ENDPOINT;
      try {
        localStorage.setItem(STORAGE.analysisAiEndpoint, this.state.analysisAiEndpoint);
      } catch (error) {
        console.warn('Failed to save analysis AI endpoint:', error);
      }
    },

    renderLayout() {
      const app = document.getElementById('app');
      app.innerHTML = `
        <div class="app-layout">
          <header class="app-header">
            <div class="app-brand">
              <img class="app-logo" src="assets/pams-mark.svg" alt="PAMS mark" loading="eager" />
              <h1 class="app-title">Personal Asset Monitoring System</h1>
            </div>
            <div class="header-actions">
              <button id="themeToggle" class="theme-toggle" title="테마 전환">🌙</button>
            </div>
          </header>
          <div class="app-body">
            <aside class="app-sidebar">
              <ul id="menu" class="sidebar-menu">
                ${this.menuItems
                  .map(
                    (item) => `
                  <li data-page="${item.id}" ${item.id === 'dashboard' ? 'class="active"' : ''}>
                    <span class="menu-icon">${item.icon}</span>
                    <span class="menu-label">${item.label}</span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            </aside>
            <main class="main-content">
              <div id="data-toolbar"></div>
              <div id="page-content"></div>
            </main>
          </div>
        </div>
      `;
      ThemeManager.updateIcon();
    },

    bindLayoutEvents() {
      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', () => ThemeManager.toggle());
      }

      const menu = document.getElementById('menu');
      if (menu) {
        menu.addEventListener('click', (event) => {
          const li = event.target.closest('li[data-page]');
          if (!li) return;
          const page = li.getAttribute('data-page');
          if (page) {
            this.renderPage(page);
          }
        });
      }
    },

    renderDataToolbar() {
      const toolbar = document.getElementById('data-toolbar');
      if (!toolbar) return;

      const metaText = this.state.fileMeta
        ? `최근 로딩 파일: ${this.escapeHtml(this.state.fileMeta.name)} · ${this.formatTimestamp(this.state.fileMeta.loadedAt)}`
        : this.state.assets.length
          ? '엑셀 미로딩 상태입니다. 현재 자산은 웹 화면에서 직접 추가한 임시 데이터입니다.'
          : '아직 파일이 로딩되지 않았습니다.';

      const messageHtml = this.state.message
        ? `<div class="connection-banner ${this.state.messageType === 'error' ? 'connection-banner-error' : 'connection-banner-warning'}" style="margin-top: 12px;"><span class="connection-banner-icon">${this.state.messageType === 'error' ? '⚠️' : 'ℹ️'}</span><div class="connection-banner-text">${this.escapeHtml(this.state.message)}</div></div>`
        : '';

      toolbar.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div class="file-loader-row">
            <div>
              <h3 class="card-title" style="margin:0;">엑셀 기반 조회 데이터</h3>
              <div class="card-subtitle">엑셀 파일 로딩 없이도 자산 페이지에서 직접 추가/삭제할 수 있습니다.</div>
              <div class="form-hint" style="margin-top: 8px;">${metaText}</div>
              <div class="form-hint">엑셀을 불러오지 않고 시작한 데이터도 [엑셀 저장]으로 내보낼 수 있습니다.</div>
              <div class="form-hint">브라우저에 마지막 작업 데이터가 자동 저장되어 재접속 시 복원됩니다. (같은 브라우저/기기 기준)</div>
            </div>
            <div class="file-loader-actions">
              <label for="excelFileInput" class="btn btn-primary">엑셀 파일 선택</label>
              <button id="loadDemoBtn" type="button" class="btn btn-secondary">데모 데이터 불러오기</button>
              <input id="excelFileInput" type="file" accept=".xlsx,.xls" style="display:none;" />
              <button id="clearDataBtn" type="button" class="btn btn-secondary" ${this.state.assets.length ? '' : 'disabled'}>데이터 초기화</button>
            </div>
          </div>
          ${messageHtml}
        </div>
      `;

      const fileInput = document.getElementById('excelFileInput');
      if (fileInput) {
        fileInput.addEventListener('change', (event) => this.handleFileSelect(event));
      }

      const demoBtn = document.getElementById('loadDemoBtn');
      if (demoBtn) {
        demoBtn.addEventListener('click', () => {
          this.loadDemoData();
        });
      }

      const clearBtn = document.getElementById('clearDataBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.clearData();
        });
      }
    },

    async handleFileSelect(event) {
      const input = event.target;
      const file = input.files && input.files[0] ? input.files[0] : null;
      if (!file) return;

      this.state.message = '엑셀 파일을 로딩 중입니다...';
      this.state.messageType = 'info';
      this.renderDataToolbar();

      try {
        const data = await this.parseExcel(file);
        this.state.assets = data.assets;
        this.state.dashboard = data.dashboard;
        this.state.message = `${file.name} 로딩 완료 (${data.assets.length}건)`;
        this.state.messageType = 'info';
        this.state.filterText = '';
        this.state.filterType = 'all';
        this.resetJsonImporterState();
        this.resetManualAssetDraft();
        this.refreshAnalysisReportIfExists();

        this.saveFileMeta({
          name: file.name,
          size: file.size,
          loadedAt: new Date().toISOString(),
        });
        this.saveDataSnapshot();

        this.renderDataToolbar();
        this.renderPage(this.currentPage);
      } catch (error) {
        console.error('Excel parse error:', error);
        this.state.message = `파일 로딩 실패: ${error.message}`;
        this.state.messageType = 'error';
        this.renderDataToolbar();
      } finally {
        input.value = '';
      }
    },

    clearData() {
      this.destroyBreakdownChart();
      this.state.assets = [];
      this.state.dashboard = null;
      this.state.message = '로딩된 데이터를 초기화했습니다.';
      this.state.messageType = 'info';
      this.state.filterText = '';
      this.state.filterType = 'all';
      this.resetJsonImporterState();
      this.resetManualAssetDraft();
      this.state.analysisReport = null;
      this.state.analysisAiReport = null;
      this.state.analysisAiLoading = false;
      this.state.analysisAiStatus = '';
      this.state.analysisAiStatusType = 'info';
      this.clearDataSnapshot();
      this.renderDataToolbar();
      this.renderPage(this.currentPage);
    },

    loadDemoData() {
      const assets = this.createDemoAssets();
      assets.forEach((asset) => {
        asset.valuation = this.computeAssetValuation(asset);
      });

      this.state.assets = assets;
      this.state.dashboard = this.buildDashboard(assets, null);
      this.state.filterText = '';
      this.state.filterType = 'all';
      this.resetJsonImporterState();
      this.resetManualAssetDraft();
      this.refreshAnalysisReportIfExists();
      this.saveFileMeta({
        name: 'DEMO_40s_single_person_profile',
        size: 0,
        loadedAt: new Date().toISOString(),
      });
      this.saveDataSnapshot();
      this.state.message = `데모 데이터 로딩 완료 (${assets.length}건, 40대 초반 1인 예시)`;
      this.state.messageType = 'info';
      this.renderDataToolbar();
      this.renderPage(this.currentPage);
    },

    createDemoAssets() {
      const rows = [
        {
          name: '실거주 아파트(서울)',
          type: 'real_estate',
          currency: 'KRW',
          valueInput: 520000000,
          valuationDisplay: 520000000,
          owner: '본인',
          market: '서울',
        },
        {
          name: '주택담보대출',
          type: 'liability',
          currency: 'KRW',
          valueInput: 235000000,
          valuationDisplay: -235000000,
          owner: '본인',
          bankName: '국민은행',
          accountNumber: 'HOME-LOAN-001',
          interestRatePct: 3.85,
          maturityDate: '2052-06-30',
        },
        {
          name: '비상금 통장',
          type: 'cash',
          currency: 'KRW',
          valueInput: 12000000,
          valuationDisplay: 12000000,
          owner: '본인',
          bankName: '토스뱅크',
          accountNumber: 'CASH-001',
        },
        {
          name: '정기예금(1년)',
          type: 'deposit',
          currency: 'KRW',
          valueInput: 40000000,
          valuationDisplay: 40000000,
          owner: '본인',
          bankName: '신한은행',
          accountNumber: 'DEP-2410',
          interestRatePct: 3.3,
          maturityDate: '2027-01-15',
        },
        {
          name: 'IRP 퇴직연금',
          type: 'pension',
          currency: 'KRW',
          valueInput: 36500000,
          valuationDisplay: 36500000,
          owner: '본인',
          bankName: '미래에셋증권',
          accountNumber: 'IRP-001',
        },
        {
          name: '연금저축펀드',
          type: 'pension',
          currency: 'KRW',
          valueInput: 24500000,
          valuationDisplay: 24500000,
          owner: '본인',
          bankName: '한국투자증권',
          accountNumber: 'PENSION-001',
        },
        {
          name: 'KODEX 200',
          type: 'etf',
          currency: 'KRW',
          valueInput: 19125000,
          valuationDisplay: null,
          quantity: 450,
          manualPrice: 42500,
          owner: '본인',
          ticker: '069500',
          market: 'KRX',
        },
        {
          name: 'SCHD',
          type: 'etf',
          currency: 'KRW',
          valueInput: 31360000,
          valuationDisplay: null,
          quantity: 320,
          manualPrice: 98000,
          owner: '본인',
          ticker: 'SCHD',
          market: 'NYSE',
        },
        {
          name: '삼성전자',
          type: 'stock',
          currency: 'KRW',
          valueInput: 15960000,
          valuationDisplay: null,
          quantity: 210,
          manualPrice: 76000,
          owner: '본인',
          ticker: '005930',
          market: 'KRX',
        },
        {
          name: 'TESLA',
          type: 'stock',
          currency: 'KRW',
          valueInput: 5580000,
          valuationDisplay: null,
          quantity: 18,
          manualPrice: 310000,
          owner: '본인',
          ticker: 'TSLA',
          market: 'NASDAQ',
        },
        {
          name: '비트코인',
          type: 'crypto',
          currency: 'KRW',
          valueInput: 7800000,
          valuationDisplay: null,
          quantity: 0.06,
          manualPrice: 130000000,
          owner: '본인',
          ticker: 'BTC',
          market: 'UPBIT',
        },
        {
          name: '실손보험 해지환급금',
          type: 'insurance',
          currency: 'KRW',
          valueInput: 11000000,
          valuationDisplay: 11000000,
          owner: '본인',
          bankName: '삼성생명',
          accountNumber: 'INS-001',
        },
        {
          name: '골드바',
          type: 'gold',
          currency: 'KRW',
          valueInput: 5600000,
          valuationDisplay: 5600000,
          owner: '본인',
        },
        {
          name: '여행적금',
          type: 'deposit',
          currency: 'KRW',
          valueInput: 8000000,
          valuationDisplay: 8000000,
          owner: '본인',
          bankName: '하나은행',
          accountNumber: 'TRAVEL-2026',
          interestRatePct: 3.8,
          maturityDate: '2026-12-31',
        },
      ];

      return rows.map((item, index) => ({
        id: `demo_${String(index + 1).padStart(2, '0')}`,
        name: item.name || `데모자산-${index + 1}`,
        type: this.normalizeAssetType(item.type || 'other'),
        currency: item.currency || 'KRW',
        valueInput: this.toNumber(item.valueInput),
        valuationDisplay: this.toNumber(item.valuationDisplay),
        quantity: this.toNumber(item.quantity),
        manualPrice: this.toNumber(item.manualPrice),
        owner: this.toStringValue(item.owner),
        ticker: this.toStringValue(item.ticker),
        market: this.toStringValue(item.market),
        avgCost: this.toNumber(item.avgCost),
        bankName: this.toStringValue(item.bankName),
        accountNumber: this.toStringValue(item.accountNumber),
        interestRatePct: this.toNumber(item.interestRatePct),
        maturityDate: this.toStringValue(item.maturityDate),
        valuation: 0,
      }));
    },

    createDefaultManualAssetDraft() {
      return {
        name: '',
        type: 'stock',
        valuation: '',
        currency: 'KRW',
        ticker: '',
        market: '',
        owner: '',
        quantity: '',
        manualPrice: '',
        bankName: '',
        accountNumber: '',
        interestRatePct: '',
        maturityDate: '',
      };
    },

    resetManualAssetDraft() {
      this.state.manualAssetDraft = this.createDefaultManualAssetDraft();
      this.state.manualAssetError = '';
    },

    resetJsonImporterState() {
      this.state.jsonDraft = '';
      this.state.jsonPreviewRows = [];
      this.state.jsonPreviewSummary = null;
      this.state.jsonValidRows = [];
      this.state.jsonStatus = '';
      this.state.jsonStatusType = 'info';
    },

    renderPage(page) {
      this.currentPage = page;
      this.updateMenuActiveState();
      if (page !== 'dashboard') {
        this.destroyBreakdownChart();
      }
      if (page !== 'analysis') {
        this.destroyAnalysisAllocChart();
      }

      const content = document.getElementById('page-content');
      if (!content) return;

      if (page === 'dashboard') {
        this.renderDashboardPage(content);
      } else if (page === 'assets') {
        this.renderAssetsPage(content);
      } else if (page === 'analysis') {
        this.renderAnalysisPage(content);
      } else if (page === 'manual') {
        this.renderManualPage(content);
      } else if (page === 'info') {
        this.renderInfoPage(content);
      } else {
        content.innerHTML = '<div class="error-container"><p>페이지를 찾을 수 없습니다.</p></div>';
      }
    },

    updateMenuActiveState() {
      document.querySelectorAll('.sidebar-menu li').forEach((item) => {
        if (item.getAttribute('data-page') === this.currentPage) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    },

    renderDashboardPage(container) {
      if (!this.state.dashboard) {
        container.innerHTML = this.renderEmptyState('대시보드 데이터를 보려면 엑셀 파일을 먼저 선택하세요.');
        return;
      }

      const dashboard = this.state.dashboard;
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">대시보드</h1>
          <p class="page-subtitle">엑셀 파일 기반 조회 전용 화면</p>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">총자산</div>
            <div class="metric-value blue">${this.formatCurrency(dashboard.totalAssets)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">총부채</div>
            <div class="metric-value orange">${this.formatCurrency(dashboard.totalLiabilities)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">순자산</div>
            <div class="metric-value green">${this.formatCurrency(dashboard.netWorth)}</div>
          </div>
        </div>

        <div class="chart-container chart-container--breakdown">
          <h3>자산 타입 비중</h3>
          <div class="chart-canvas chart-canvas--breakdown">
            <canvas id="breakdownChart"></canvas>
          </div>
          <div class="breakdown-legend" id="breakdownLegend"></div>
        </div>
      `;

      this.renderBreakdownLegend(dashboard.breakdown);
      this.renderBreakdownChart(dashboard.breakdown);
    },

    renderAssetsPage(container) {
      const typeOptions = this.getTypeOptions();
      const filtered = this.getFilteredAssets();
      const total = filtered.reduce((sum, asset) => sum + (asset.valuation || 0), 0);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">자산</h1>
          <p class="page-subtitle">엑셀 없이도 직접 입력 또는 JSON 붙여넣기로 자산을 관리할 수 있습니다.</p>
        </div>

        <div class="chart-container">
          <h3>직접 자산 입력</h3>
          ${this.renderManualAssetEditor()}
        </div>

        <div class="chart-container">
          <h3>자산 목록</h3>

          <div class="asset-filter-row">
            <input id="assetSearchInput" class="form-input" type="text" placeholder="자산명/티커/소유자 검색" value="${this.escapeHtml(this.state.filterText)}" />
            <select id="assetTypeFilter" class="form-select">
              <option value="all">전체 타입</option>
              ${typeOptions
                .map(
                  (type) =>
                    `<option value="${this.escapeHtml(type)}" ${this.state.filterType === type ? 'selected' : ''}>${this.escapeHtml(
                      this.getAssetTypeLabel(type)
                    )}</option>`
                )
                .join('')}
            </select>
            <button id="assetFilterReset" type="button" class="btn btn-secondary">필터 초기화</button>
          </div>

          <div class="asset-summary">
            <span>표시 자산 ${filtered.length}건 합계</span>
            <div class="asset-summary-actions">
              <strong>${this.formatCurrency(total)}</strong>
              <button id="exportAssetsExcelBtn" type="button" class="btn btn-secondary" ${this.state.assets.length ? '' : 'disabled'}>엑셀 저장</button>
            </div>
          </div>

          ${filtered.length
            ? this.renderAssetsTable(filtered)
            : this.renderEmptyState(this.state.assets.length ? '조건에 맞는 자산이 없습니다.' : '등록된 자산이 없습니다. 직접 입력 또는 JSON 입력기를 사용하세요.', true)}
        </div>

        <div class="chart-container">
          <h3>JSON 자산 입력기</h3>
          ${this.renderJsonImporter()}
        </div>
      `;

      this.bindAssetFilterEvents();
      this.bindAssetCrudEvents();
      this.bindManualAmountHints();
      this.bindJsonImporterEvents();
    },

    getDefaultAnalysisProfile() {
      return {
        age_range: '40s',
        household_size: 1,
        dependents: 0,
        income_type: 'fixed',
        monthly_income: 6500000,
        monthly_expense: 3500000,
        risk_preference: 'moderate',
        housing_status: 'owner',
        retirement_age: 60,
        goals: ['retirement', 'leisure'],
      };
    },

    renderAnalysisPage(container) {
      const profile = {
        ...this.getDefaultAnalysisProfile(),
        ...(this.state.analysisProfile || {}),
      };
      const goals = new Set(Array.isArray(profile.goals) ? profile.goals : []);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">자산 분석</h1>
          <p class="page-subtitle">설문 기반으로 현재 자산구성과 목표 비중을 비교해 리포트를 생성합니다.</p>
        </div>

        <div class="chart-container">
          <h3>분석 설문</h3>
          <div class="form-hint">프로필 저장 후 리포트를 생성하면 현재 자산 데이터 기준으로 분석 결과가 계산됩니다.</div>
          <div class="asset-manual-grid" style="margin-top:12px;">
            <div>
              <label class="form-label" for="analysisAgeRange">연령대</label>
              <select id="analysisAgeRange" class="form-select">
                <option value="20s" ${profile.age_range === '20s' ? 'selected' : ''}>20대</option>
                <option value="30s" ${profile.age_range === '30s' ? 'selected' : ''}>30대</option>
                <option value="40s" ${profile.age_range === '40s' ? 'selected' : ''}>40대</option>
                <option value="50s" ${profile.age_range === '50s' ? 'selected' : ''}>50대</option>
                <option value="60s" ${profile.age_range === '60s' ? 'selected' : ''}>60대 이상</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="analysisHouseholdSize">가구원 수</label>
              <input id="analysisHouseholdSize" class="form-input" type="number" min="1" step="1" value="${this.escapeHtml(String(profile.household_size || 1))}" />
            </div>
            <div>
              <label class="form-label" for="analysisDependents">부양가족 수</label>
              <input id="analysisDependents" class="form-input" type="number" min="0" step="1" value="${this.escapeHtml(String(profile.dependents || 0))}" />
            </div>
            <div>
              <label class="form-label" for="analysisIncomeType">소득 안정성</label>
              <select id="analysisIncomeType" class="form-select">
                <option value="fixed" ${profile.income_type === 'fixed' ? 'selected' : ''}>고정소득형</option>
                <option value="mixed" ${profile.income_type === 'mixed' ? 'selected' : ''}>혼합형</option>
                <option value="variable" ${profile.income_type === 'variable' ? 'selected' : ''}>변동소득형</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="analysisMonthlyIncome">월 소득</label>
              <div class="analysis-input">
                <input id="analysisMonthlyIncome" class="form-input" type="number" min="0" step="10000" value="${this.escapeHtml(String(profile.monthly_income || ''))}" />
                <div class="form-hint" id="analysisMonthlyIncomeWords"></div>
              </div>
            </div>
            <div>
              <label class="form-label" for="analysisMonthlyExpense">월 지출</label>
              <div class="analysis-input">
                <input id="analysisMonthlyExpense" class="form-input" type="number" min="0" step="10000" value="${this.escapeHtml(String(profile.monthly_expense || ''))}" />
                <div class="form-hint" id="analysisMonthlyExpenseWords"></div>
              </div>
            </div>
            <div>
              <label class="form-label" for="analysisRiskPreference">투자 성향</label>
              <select id="analysisRiskPreference" class="form-select">
                <option value="conservative" ${profile.risk_preference === 'conservative' ? 'selected' : ''}>안정형</option>
                <option value="moderate" ${profile.risk_preference === 'moderate' ? 'selected' : ''}>중립형</option>
                <option value="aggressive" ${profile.risk_preference === 'aggressive' ? 'selected' : ''}>공격형</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="analysisHousingStatus">주거 형태</label>
              <select id="analysisHousingStatus" class="form-select">
                <option value="owner" ${profile.housing_status === 'owner' ? 'selected' : ''}>자가</option>
                <option value="rent" ${profile.housing_status === 'rent' ? 'selected' : ''}>임차</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="analysisRetirementAge">은퇴 목표 나이</label>
              <input id="analysisRetirementAge" class="form-input" type="number" min="45" max="80" step="1" value="${this.escapeHtml(String(profile.retirement_age || 60))}" />
            </div>
          </div>

          <div class="form-group" style="margin-top:14px; margin-bottom:8px;">
            <label class="form-label">재무 목표</label>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              ${this.renderAnalysisGoalCheckbox('home_purchase', '주택마련', goals.has('home_purchase'))}
              ${this.renderAnalysisGoalCheckbox('retirement', '은퇴준비', goals.has('retirement'))}
              ${this.renderAnalysisGoalCheckbox('education', '교육비', goals.has('education'))}
              ${this.renderAnalysisGoalCheckbox('leisure', '여가/여행', goals.has('leisure'))}
            </div>
          </div>

          <div class="form-row" style="gap:12px; align-items:center; margin-top:12px;">
            <button id="analysisSave" type="button" class="btn btn-primary">프로필 저장</button>
            <button id="analysisGenerate" type="button" class="btn btn-secondary">리포트 생성</button>
            <span id="analysisStatus" style="color: var(--text-secondary); font-size:13px;"></span>
          </div>

          <div class="analysis-ai-panel">
            <div class="analysis-ai-panel-head">
              <h4>OpenAI 확장 리포트</h4>
              <span class="analysis-ai-pill">서버리스 API</span>
            </div>
            <p class="form-hint" style="margin-top:0;">
              API 키는 서버리스 환경변수에만 저장하고, 브라우저는 엔드포인트만 호출합니다.
            </p>
            <div class="analysis-ai-endpoint-row">
              <input
                id="analysisAiEndpoint"
                class="form-input"
                type="text"
                value="${this.escapeHtml(this.state.analysisAiEndpoint || DEFAULT_OPENAI_REPORT_ENDPOINT)}"
                placeholder="/api/openai-asset-report"
              />
              <button id="analysisAiGenerate" type="button" class="btn btn-primary" ${this.state.analysisAiLoading ? 'disabled' : ''}>
                ${this.state.analysisAiLoading ? '생성 중...' : 'OpenAI 리포트 생성'}
              </button>
            </div>
            <div id="analysisAiStatus" class="analysis-ai-status ${this.escapeHtml(this.state.analysisAiStatusType || 'info')}">
              ${this.escapeHtml(this.state.analysisAiStatus || '')}
            </div>
          </div>
        </div>

        <div id="analysisReport" class="chart-container" style="${this.state.analysisReport ? '' : 'display:none;'}">
          <h3>자산 분석 리포트</h3>
          <div id="analysisReportContent"></div>
        </div>

        <div id="analysisAiReport" class="chart-container" style="${this.state.analysisAiReport ? '' : 'display:none;'}">
          <h3>OpenAI 확장 리포트</h3>
          <div id="analysisAiReportContent"></div>
        </div>
      `;

      this.bindAnalysisEvents();
      this.bindAnalysisAmountHints();
      if (this.state.analysisReport) {
        this.renderAnalysisReport(this.state.analysisReport);
      }
      if (this.state.analysisAiReport) {
        this.renderAnalysisAiReport(this.state.analysisAiReport);
      }
    },

    renderManualPage(container) {
      const prompt = this.escapeHtml(this.getJsonAssetPrompt());

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">웹 매뉴얼</h1>
          <p class="page-subtitle">Personal Asset Monitoring System 웹 버전 전용 사용 가이드입니다.</p>
        </div>

        <div class="manual-content">
          <div class="manual-body">
            <h2>1. 시작하기</h2>
            <ol>
              <li>빠른 확인이 필요하면 <strong>데모 데이터 불러오기</strong> 버튼을 먼저 눌러 샘플 데이터를 확인합니다.</li>
              <li>실데이터를 쓸 때는 상단의 <strong>엑셀 파일 선택</strong>으로 기존 파일을 열거나, 자산 페이지에서 직접 자산을 추가합니다.</li>
              <li>브라우저는 최근 작업 상태를 자동 저장/복원하므로 다음 접속 시 이어서 작업할 수 있습니다.</li>
            </ol>

            <h2>2. 자산 입력 방법</h2>
            <h3>A. 직접 입력</h3>
            <ul>
              <li>필수값: <code>자산명</code>, <code>자산타입</code>, <code>평가금액</code></li>
              <li>타입에 따라 옵션 필드가 자동으로 바뀝니다. (예: 주식/ETF는 티커, 예금은 기관/만기)</li>
              <li>목록에서 수정/삭제 후 즉시 합계와 분석 결과에 반영됩니다.</li>
            </ul>

            <h3>B. JSON 자산 입력기 (외부 LLM 연동)</h3>
            <ul>
              <li>자산 앱/화면을 캡처하고 아래 프롬프트를 외부 AI(ChatGPT, Copilot 등)에 전달합니다.</li>
              <li>AI가 만든 JSON을 붙여넣고 <strong>미리보기</strong>에서 직접 보정한 뒤 <strong>자산 반영</strong>을 누릅니다.</li>
              <li>타입이 표준 목록과 다르면 자동으로 <code>other</code>로 폴백되어 나중에 수정 가능합니다.</li>
            </ul>

            <div class="asset-json-prompt-card" style="margin-top: 12px;">
              <div class="asset-json-prompt-header">
                <strong>LLM 입력 프롬프트</strong>
                <button id="manualPromptCopyBtn" type="button" class="btn btn-secondary btn-compact">프롬프트 복사</button>
              </div>
              <pre class="asset-json-prompt-body">${prompt}</pre>
            </div>

            <h3>C. 엑셀 저장/재사용</h3>
            <ul>
              <li>자산 페이지의 <strong>엑셀 저장</strong> 버튼으로 <code>Assets</code>, <code>Dashboard</code> 시트를 함께 내보냅니다.</li>
              <li>저장한 엑셀은 다음 접속 시 다시 선택하면 동일 구조로 재로딩됩니다.</li>
            </ul>

            <h2>3. 입력 규칙 (자주 발생하는 오류)</h2>
            <ul>
              <li><code>valuation</code>은 <strong>평가금액</strong>이며 <strong>평가손익</strong> 값이 아닙니다.</li>
              <li>평가금액은 양수 입력 기준이며, 부채(<code>liability</code>)는 저장 시 자동으로 음수 변환됩니다.</li>
            </ul>

            <h2>4. 보안/개인정보</h2>
            <ul>
              <li>기본 기능(엑셀/수동입력/JSON 반영/로컬 리포트)은 브라우저 내에서만 처리됩니다.</li>
              <li>OpenAI 확장 리포트를 실행하면 분석 요약 데이터가 사용자가 지정한 서버리스 API를 통해 OpenAI로 전송됩니다.</li>
              <li>OpenAI API 키는 프론트가 아닌 서버리스 환경변수에 저장해야 합니다.</li>
            </ul>
          </div>
        </div>
      `;

      this.bindManualPageEvents();
    },

    bindManualPageEvents() {
      const copyBtn = document.getElementById('manualPromptCopyBtn');
      if (!copyBtn) return;

      copyBtn.addEventListener('click', async () => {
        const ok = await this.copyToClipboard(this.getJsonAssetPrompt());
        this.state.message = ok ? '매뉴얼의 LLM 프롬프트를 복사했습니다.' : '프롬프트 복사에 실패했습니다.';
        this.state.messageType = ok ? 'success' : 'error';
        this.renderDataToolbar();
      });
    },

    renderInfoPage(container) {
      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">정보</h1>
          <p class="page-subtitle">Personal Asset Monitoring System 웹 버전 소개 및 오픈소스 고지</p>
        </div>

        <div class="about-hero-card">
          <div class="about-logo">
            <img src="assets/pams-mark.svg" alt="PAMS mark" class="about-logo-image" />
          </div>
          <div class="about-hero-content">
            <h2 class="product-name">Personal Asset Monitoring System</h2>
            <div class="product-meta">
              <span class="version-badge">Web Edition</span>
              <span class="codename-badge">Hackathon Demo</span>
            </div>
            <p class="product-description">
              개인 자산을 사용자가 직접 입력/검증/수정하고, 엑셀로 저장해 계속 관리할 수 있는 브라우저 기반 자산 모니터링 시스템입니다.
              마이데이터 연동 없이도 캡처+LLM+JSON 흐름으로 데이터를 구조화해 반영할 수 있습니다.
            </p>
            <div class="product-details">
              <div class="detail-item">
                <span class="detail-label">실행 환경</span>
                <span class="detail-value">Browser Only (Static Web)</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">데이터 저장</span>
                <span class="detail-value">LocalStorage + Excel Export</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">핵심 입력</span>
                <span class="detail-value">Manual / JSON / Excel</span>
              </div>
            </div>
          </div>
        </div>

        <div class="about-grid">
          <div class="about-section-card">
            <div class="section-header">
              <span class="section-icon">🔐</span>
              <h3 class="section-title">보안 및 데이터 처리</h3>
            </div>
            <div class="manual-body">
              <ul>
                <li>기본 입력/조회/저장 기능은 브라우저 내부에서 처리됩니다.</li>
                <li>OpenAI 확장 리포트를 실행하면 분석용 요약 데이터만 서버리스 API를 거쳐 OpenAI로 전송됩니다.</li>
                <li>API 키는 서버리스 환경변수로만 저장하고, 프론트 코드/브라우저 저장소에 두지 않습니다.</li>
                <li>외부 LLM 사용 시에는 사용자가 선택한 서비스에만 캡처/프롬프트를 전달합니다.</li>
              </ul>
            </div>
          </div>

          <div class="about-section-card">
            <div class="section-header">
              <span class="section-icon">🧩</span>
              <h3 class="section-title">웹 버전 주요 기능</h3>
            </div>
            <div class="manual-body">
              <ul>
                <li>엑셀 없이 자산 추가/수정/삭제 및 즉시 분석</li>
                <li>JSON 붙여넣기 입력기 + 미리보기 보정 + 타입 폴백</li>
                <li>자산 분석 리포트(비상자금, 저축률, 배분 비교, 추천 액션)</li>
                <li>OpenAI 확장 리포트(요약/강점/리스크/30일·90일 액션)</li>
                <li>엑셀 내보내기/재불러오기, 다크·라이트 테마 전환</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="about-opensource-card">
          <div class="section-header">
            <span class="section-icon">📚</span>
            <h3 class="section-title">사용 오픈소스 (Web Edition)</h3>
          </div>
          <p class="opensource-intro">
            웹 배포 버전에서 실제로 로드되는 프런트엔드 의존성 기준입니다.
          </p>
          <div style="overflow-x:auto;">
            <table class="opensource-table">
              <thead>
                <tr>
                  <th>라이브러리</th>
                  <th>버전</th>
                  <th>라이선스</th>
                  <th>용도</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><a class="lib-link" href="https://www.chartjs.org/" target="_blank" rel="noopener noreferrer">Chart.js <span class="external-icon">↗</span></a></td>
                  <td><code>4.4.0</code></td>
                  <td><span class="license-badge">MIT</span></td>
                  <td class="lib-description">자산 비중 차트 및 분석 비교 차트 렌더링</td>
                </tr>
                <tr>
                  <td><a class="lib-link" href="https://sheetjs.com/" target="_blank" rel="noopener noreferrer">SheetJS (xlsx) <span class="external-icon">↗</span></a></td>
                  <td><code>0.18.5</code></td>
                  <td><span class="license-badge">Apache-2.0</span></td>
                  <td class="lib-description">엑셀 파일 읽기/내보내기</td>
                </tr>
                <tr>
                  <td><a class="lib-link" href="https://ant.design/" target="_blank" rel="noopener noreferrer">Ant Design CSS <span class="external-icon">↗</span></a></td>
                  <td><code>5.12.8</code></td>
                  <td><span class="license-badge">MIT</span></td>
                  <td class="lib-description">기본 UI 리셋/스타일 기반</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    },

    renderAnalysisGoalCheckbox(value, label, checked) {
      return `
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" class="analysis-goal" value="${this.escapeHtml(value)}" ${checked ? 'checked' : ''} />
          <span>${this.escapeHtml(label)}</span>
        </label>
      `;
    },

    bindAnalysisEvents() {
      const saveBtn = document.getElementById('analysisSave');
      const generateBtn = document.getElementById('analysisGenerate');
      const aiGenerateBtn = document.getElementById('analysisAiGenerate');
      const aiEndpointInput = document.getElementById('analysisAiEndpoint');

      if (aiEndpointInput) {
        aiEndpointInput.addEventListener('change', () => {
          this.saveAnalysisAiEndpoint(aiEndpointInput.value);
          aiEndpointInput.value = this.state.analysisAiEndpoint;
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const answers = this.gatherAnalysisAnswers();
          this.saveAnalysisProfile(answers);
          this.invalidateAnalysisAiReport('프로필이 변경되어 OpenAI 리포트를 다시 생성해주세요.');
          this.setAnalysisStatus('프로필 저장 완료', 'success');
        });
      }

      if (generateBtn) {
        generateBtn.addEventListener('click', () => {
          if (!this.state.assets.length) {
            this.setAnalysisStatus('분석할 자산 데이터가 없습니다. 데모 데이터 또는 엑셀을 먼저 불러오세요.', 'error');
            return;
          }
          const answers = this.gatherAnalysisAnswers();
          this.saveAnalysisProfile(answers);
          this.state.analysisReport = this.generateAnalysisReport(answers);
          this.invalidateAnalysisAiReport('기본 리포트가 갱신되어 OpenAI 리포트를 다시 생성해주세요.');
          this.renderAnalysisReport(this.state.analysisReport);
          this.setAnalysisStatus('리포트 생성 완료', 'success');
        });
      }

      if (aiGenerateBtn) {
        aiGenerateBtn.addEventListener('click', async () => {
          await this.generateAnalysisAiReport();
        });
      }
    },

    gatherAnalysisAnswers() {
      const goals = Array.from(document.querySelectorAll('.analysis-goal'))
        .filter((box) => box.checked)
        .map((box) => box.value);

      return {
        age_range: document.getElementById('analysisAgeRange')?.value || '40s',
        household_size: Math.max(1, parseInt(document.getElementById('analysisHouseholdSize')?.value || '1', 10) || 1),
        dependents: Math.max(0, parseInt(document.getElementById('analysisDependents')?.value || '0', 10) || 0),
        income_type: document.getElementById('analysisIncomeType')?.value || 'fixed',
        monthly_income: Math.max(0, this.toNumber(document.getElementById('analysisMonthlyIncome')?.value) || 0),
        monthly_expense: Math.max(0, this.toNumber(document.getElementById('analysisMonthlyExpense')?.value) || 0),
        risk_preference: document.getElementById('analysisRiskPreference')?.value || 'moderate',
        housing_status: document.getElementById('analysisHousingStatus')?.value || 'owner',
        retirement_age: Math.max(45, parseInt(document.getElementById('analysisRetirementAge')?.value || '60', 10) || 60),
        goals,
      };
    },

    setAnalysisStatus(text, type = 'info') {
      const statusEl = document.getElementById('analysisStatus');
      if (!statusEl) return;
      statusEl.textContent = text || '';
      if (type === 'error') {
        statusEl.style.color = 'var(--accent-red)';
      } else if (type === 'success') {
        statusEl.style.color = 'var(--accent-green)';
      } else {
        statusEl.style.color = 'var(--text-secondary)';
      }
    },

    setAnalysisAiStatus(text, type = 'info') {
      this.state.analysisAiStatus = text || '';
      this.state.analysisAiStatusType = type || 'info';

      const statusEl = document.getElementById('analysisAiStatus');
      if (!statusEl) return;
      statusEl.textContent = this.state.analysisAiStatus;
      statusEl.className = `analysis-ai-status ${this.state.analysisAiStatusType}`;
    },

    invalidateAnalysisAiReport(message) {
      this.state.analysisAiReport = null;
      const wrapper = document.getElementById('analysisAiReport');
      if (wrapper) wrapper.style.display = 'none';
      if (message) {
        this.setAnalysisAiStatus(message, 'info');
      } else {
        this.setAnalysisAiStatus('', 'info');
      }
    },

    async generateAnalysisAiReport() {
      if (this.state.analysisAiLoading) return;
      if (!this.state.assets.length) {
        this.setAnalysisAiStatus('분석할 자산 데이터가 없습니다. 데모 데이터 또는 엑셀을 먼저 불러오세요.', 'error');
        return;
      }

      const endpointInputValue = document.getElementById('analysisAiEndpoint')?.value;
      this.saveAnalysisAiEndpoint(endpointInputValue);
      const endpoint = this.state.analysisAiEndpoint || DEFAULT_OPENAI_REPORT_ENDPOINT;

      const answers = this.gatherAnalysisAnswers();
      this.saveAnalysisProfile(answers);
      this.state.analysisReport = this.generateAnalysisReport(answers);
      this.renderAnalysisReport(this.state.analysisReport);

      this.state.analysisAiReport = null;
      this.state.analysisAiLoading = true;
      this.setAnalysisAiStatus('OpenAI 리포트를 생성 중입니다...', 'info');
      const pageContent = document.getElementById('page-content');
      if (pageContent) this.renderAnalysisPage(pageContent);

      try {
        const payload = this.buildAnalysisAiPayload(answers, this.state.analysisReport);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok) {
          const message = result && typeof result.error === 'string' ? result.error : `요청 실패 (${response.status})`;
          throw new Error(message);
        }
        if (!result || typeof result !== 'object' || !result.report) {
          throw new Error('서버 응답 형식이 올바르지 않습니다.');
        }

        this.state.analysisAiReport = result;
        this.setAnalysisAiStatus('OpenAI 리포트 생성 완료', 'success');
      } catch (error) {
        console.error('OpenAI analysis report error:', error);
        this.setAnalysisAiStatus(`OpenAI 리포트 생성 실패: ${error.message}`, 'error');
      } finally {
        this.state.analysisAiLoading = false;
        if (this.currentPage === 'analysis') {
          const currentContent = document.getElementById('page-content');
          if (currentContent) this.renderAnalysisPage(currentContent);
        }
      }
    },

    buildAnalysisAiPayload(answers, report) {
      const metrics = report?.metrics || {};
      const allocation = report?.allocation || {};
      const recommendations = Array.isArray(report?.recommendations) ? report.recommendations.slice(0, 8) : [];
      const topAssets = this.getTopAssetsForAi(10);

      return {
        generated_at: new Date().toISOString(),
        locale: 'ko-KR',
        profile: {
          age_range: answers.age_range,
          household_size: answers.household_size,
          dependents: answers.dependents,
          income_type: answers.income_type,
          monthly_income: answers.monthly_income,
          monthly_expense: answers.monthly_expense,
          risk_preference: answers.risk_preference,
          housing_status: answers.housing_status,
          retirement_age: answers.retirement_age,
          goals: Array.isArray(answers.goals) ? answers.goals : [],
        },
        snapshot: {
          total_assets: metrics.total_assets || 0,
          total_liabilities: metrics.total_liabilities || 0,
          net_worth: metrics.net_worth || 0,
          emergency_months: metrics.emergency_months || 0,
          emergency_target_months: metrics.emergency_target_months || 0,
          debt_ratio: metrics.debt_ratio || 0,
          savings_rate: metrics.savings_rate || 0,
          monthly_surplus: metrics.monthly_surplus || 0,
          allocation_current: allocation.current || {},
          allocation_target: allocation.target || {},
          local_summary: report?.summary || '',
          local_recommendations: recommendations,
        },
        assets: topAssets,
      };
    },

    getTopAssetsForAi(limit = 10) {
      const top = (Array.isArray(this.state.assets) ? this.state.assets : [])
        .map((asset) => ({
          name: asset?.name || '-',
          type: this.normalizeAssetType(asset?.type || 'other'),
          valuation: Number(asset?.valuation || 0),
          currency: asset?.currency || 'KRW',
          ticker: asset?.ticker || null,
          market: asset?.market || null,
        }))
        .filter((asset) => Number.isFinite(asset.valuation) && asset.valuation !== 0)
        .sort((a, b) => Math.abs(b.valuation) - Math.abs(a.valuation))
        .slice(0, limit);
      return top;
    },

    bindAnalysisAmountHints() {
      const bind = (inputId, outId) => {
        const inputEl = document.getElementById(inputId);
        const outEl = document.getElementById(outId);
        if (!inputEl || !outEl) return;

        const render = () => {
          const num = this.toNumber(inputEl.value);
          outEl.textContent = num === null ? '' : this.formatKoreanAmountWords(num);
        };
        inputEl.addEventListener('input', render);
        render();
      };

      bind('analysisMonthlyIncome', 'analysisMonthlyIncomeWords');
      bind('analysisMonthlyExpense', 'analysisMonthlyExpenseWords');
    },

    bindManualAmountHints() {
      const valuationInput = document.getElementById('manualAssetValuation');
      const valuationWords = document.getElementById('manualAssetValuationWords');
      const typeSelect = document.getElementById('manualAssetType');
      if (!valuationInput || !valuationWords || !typeSelect) return;

      const render = () => {
        const num = this.toNumber(valuationInput.value);
        if (num === null) {
          valuationWords.textContent = '';
          return;
        }

        const words = this.formatKoreanAmountWords(num);
        if (!words) {
          valuationWords.textContent = '';
          return;
        }

        const type = this.normalizeAssetType(typeSelect.value || 'other');
        valuationWords.textContent = type === 'liability' ? `${words} (부채는 저장 시 음수 변환)` : words;
      };

      valuationInput.addEventListener('input', render);
      typeSelect.addEventListener('change', render);
      render();
    },

    refreshAnalysisReportIfExists() {
      const hadAiReport = !!this.state.analysisAiReport;
      this.invalidateAnalysisAiReport(hadAiReport ? '자산이 변경되어 OpenAI 리포트를 다시 생성해주세요.' : '');
      if (!this.state.analysisReport) return;
      const answers = this.state.analysisProfile || this.getDefaultAnalysisProfile();
      this.state.analysisReport = this.generateAnalysisReport(answers);
      if (this.currentPage === 'analysis') {
        this.renderAnalysisReport(this.state.analysisReport);
      }
    },

    generateAnalysisReport(answers) {
      return this.buildAnalysisReport(answers || this.state.analysisProfile || this.getDefaultAnalysisProfile());
    },

    buildAnalysisReport(answers) {
      const metrics = this.computeAnalysisMetrics(this.state.assets, answers);
      const allocation = this.computeAnalysisAllocation(this.state.assets, answers);
      const recommendations = this.buildAnalysisRecommendations(metrics, allocation, answers);
      const insights = this.buildAnalysisInsights(metrics, answers);
      const summary = this.buildAnalysisSummary(metrics, allocation, answers);

      return {
        metrics,
        allocation,
        recommendations,
        insights,
        summary,
      };
    },

    computeAnalysisMetrics(assets, answers) {
      const list = Array.isArray(assets) ? assets : [];
      let totalAssets = 0;
      let totalLiabilities = 0;
      let liquidityAmount = 0;

      list.forEach((asset) => {
        const valuation = Number(asset.valuation || 0);
        if (!Number.isFinite(valuation) || valuation === 0) return;
        if (valuation > 0) {
          totalAssets += valuation;
          if (this.getAnalysisBucket(asset.type) === 'liquidity') {
            liquidityAmount += valuation;
          }
        } else {
          totalLiabilities += Math.abs(valuation);
        }
      });

      const income = Math.max(0, Number(answers.monthly_income || 0));
      const expense = Math.max(0, Number(answers.monthly_expense || 0));
      const monthlySurplus = income - expense;
      const savingsRate = income > 0 ? (monthlySurplus / income) * 100 : 0;
      const emergencyTargetMonths = { fixed: 6, mixed: 7, variable: 9 }[answers.income_type] || 6;
      const emergencyTarget = expense * emergencyTargetMonths;
      const emergencyMonths = expense > 0 ? liquidityAmount / expense : 0;
      const emergencyGap = Math.max(emergencyTarget - liquidityAmount, 0);
      const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

      return {
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        liquidity_amount: liquidityAmount,
        emergency_target_months: emergencyTargetMonths,
        emergency_months: Number(emergencyMonths.toFixed(1)),
        emergency_gap: emergencyGap,
        savings_rate: Number(savingsRate.toFixed(1)),
        debt_ratio: Number(debtRatio.toFixed(1)),
        monthly_surplus: monthlySurplus,
      };
    },

    computeAnalysisAllocation(assets, answers) {
      const list = Array.isArray(assets) ? assets : [];
      const amount = { liquidity: 0, equity: 0, real_estate: 0, gold: 0 };
      let total = 0;

      list.forEach((asset) => {
        const valuation = Number(asset.valuation || 0);
        if (!Number.isFinite(valuation) || valuation <= 0) return;
        total += valuation;
        const bucket = this.getAnalysisBucket(asset.type);
        amount[bucket] = (amount[bucket] || 0) + valuation;
      });

      const current = {
        liquidity: total > 0 ? (amount.liquidity / total) * 100 : 0,
        equity: total > 0 ? (amount.equity / total) * 100 : 0,
        real_estate: total > 0 ? (amount.real_estate / total) * 100 : 0,
        gold: total > 0 ? (amount.gold / total) * 100 : 0,
      };

      const target = this.buildAnalysisTargetAllocation(answers);
      return {
        current: this.normalizeAllocationPercent(current),
        target: this.normalizeAllocationPercent(target),
      };
    },

    buildAnalysisTargetAllocation(answers) {
      const risk = answers.risk_preference || 'moderate';
      const baseByRisk = {
        conservative: { liquidity: 40, equity: 20, real_estate: 35, gold: 5 },
        moderate: { liquidity: 25, equity: 45, real_estate: 25, gold: 5 },
        aggressive: { liquidity: 15, equity: 60, real_estate: 20, gold: 5 },
      };
      const target = { ...(baseByRisk[risk] || baseByRisk.moderate) };

      const age = this.getAgeFromRange(answers.age_range);
      const goals = new Set(Array.isArray(answers.goals) ? answers.goals : []);

      if (age < 35) {
        target.equity += 5;
        target.liquidity -= 5;
      } else if (age >= 60) {
        target.liquidity += 10;
        target.equity -= 10;
      } else if (age >= 50) {
        target.liquidity += 5;
        target.equity -= 5;
      }

      if (answers.housing_status === 'rent') {
        target.liquidity += 5;
        target.real_estate -= 5;
      }

      if (goals.has('home_purchase') && answers.housing_status === 'rent') {
        target.real_estate += 5;
        target.equity -= 5;
      }

      if (goals.has('retirement') && age <= 45) {
        target.equity += 5;
        target.liquidity -= 3;
        target.real_estate -= 2;
      }

      return target;
    },

    normalizeAllocationPercent(raw) {
      const keys = ['liquidity', 'equity', 'real_estate', 'gold'];
      const clamped = {};
      keys.forEach((key) => {
        clamped[key] = Math.max(0, Number(raw[key] || 0));
      });

      const sum = keys.reduce((acc, key) => acc + clamped[key], 0);
      if (sum <= 0) {
        return { liquidity: 25, equity: 45, real_estate: 25, gold: 5 };
      }

      const normalized = {};
      keys.forEach((key) => {
        normalized[key] = Number(((clamped[key] / sum) * 100).toFixed(1));
      });

      const fixedSum = keys.reduce((acc, key) => acc + normalized[key], 0);
      const diff = Number((100 - fixedSum).toFixed(1));
      if (Math.abs(diff) >= 0.1) {
        const maxKey = keys.reduce((best, key) => (normalized[key] > normalized[best] ? key : best), keys[0]);
        normalized[maxKey] = Number((normalized[maxKey] + diff).toFixed(1));
      }
      return normalized;
    },

    buildAnalysisSummary(metrics, allocation, answers) {
      const ageLabelMap = { '20s': '20대', '30s': '30대', '40s': '40대', '50s': '50대', '60s': '60대 이상' };
      const ageLabel = ageLabelMap[answers.age_range] || '기타';
      return `${ageLabel} ${answers.household_size || 1}인 가구 기준으로, 현재 순자산은 ${this.formatCurrency(
        metrics.net_worth
      )}이며 비상자금은 ${metrics.emergency_months}개월치입니다. 투자성향(${answers.risk_preference}) 대비 현재 자산배분의 차이를 기준으로 우선 조정 항목을 제시합니다.`;
    },

    buildAnalysisInsights(metrics, answers) {
      const list = [];
      list.push(`총자산 ${this.formatCurrency(metrics.total_assets)} / 총부채 ${this.formatCurrency(metrics.total_liabilities)} / 순자산 ${this.formatCurrency(metrics.net_worth)}`);
      list.push(`월 잉여자금 ${this.formatCurrency(metrics.monthly_surplus)} (저축률 ${metrics.savings_rate}%)`);
      list.push(`비상자금 ${metrics.emergency_months}개월치 보유 (목표 ${metrics.emergency_target_months}개월)`);
      list.push(`부채비율 ${metrics.debt_ratio}%`);

      const currentAge = this.getAgeFromRange(answers.age_range);
      const retirementAge = Math.max(currentAge, Number(answers.retirement_age || currentAge));
      list.push(`은퇴 목표까지 약 ${Math.max(0, retirementAge - currentAge)}년`);
      return list;
    },

    buildAnalysisRecommendations(metrics, allocation, answers) {
      const rec = [];

      if (metrics.emergency_gap > 0) {
        rec.push(`비상자금이 목표 대비 ${this.formatCurrency(metrics.emergency_gap)} 부족합니다. 현금/예금 비중을 우선 보강하세요.`);
      }
      if (metrics.savings_rate < 15) {
        rec.push('저축률이 15% 미만입니다. 고정지출 점검 또는 자동이체 저축액 증액을 검토하세요.');
      }
      if (metrics.debt_ratio > 60) {
        rec.push('부채비율이 높은 편입니다. 고금리 부채 상환 우선순위를 설정하세요.');
      }

      const labels = {
        liquidity: '현금성 자산',
        equity: '주식/펀드성 자산',
        real_estate: '부동산 자산',
        gold: '금 자산',
      };
      ['liquidity', 'equity', 'real_estate', 'gold'].forEach((key) => {
        const gap = (allocation.target[key] || 0) - (allocation.current[key] || 0);
        if (gap >= 8) rec.push(`${labels[key]} 비중을 약 ${gap.toFixed(1)}%p 확대하는 것이 목표 배분에 유리합니다.`);
        if (gap <= -8) rec.push(`${labels[key]} 비중이 목표 대비 ${Math.abs(gap).toFixed(1)}%p 높습니다. 일부 리밸런싱을 고려하세요.`);
      });

      if ((answers.goals || []).includes('retirement') && this.getAgeFromRange(answers.age_range) <= 45) {
        rec.push('은퇴준비 목표가 있어 장기 투자성 자산(ETF/연금) 비중을 점진적으로 늘리는 전략이 적합합니다.');
      }

      if (!rec.length) rec.push('현재 자산구성이 프로필 목표와 유사합니다. 분기 단위 점검만 유지하세요.');
      return rec;
    },

    getAnalysisBucket(type) {
      const normalized = this.normalizeAssetType(type || 'other');
      if (['cash', 'deposit', 'insurance', 'other'].includes(normalized)) return 'liquidity';
      if (['stock', 'etf', 'crypto', 'bond', 'fund', 'pension'].includes(normalized)) return 'equity';
      if (normalized === 'real_estate') return 'real_estate';
      if (normalized === 'gold') return 'gold';
      return 'liquidity';
    },

    renderAnalysisReport(report) {
      const wrapper = document.getElementById('analysisReport');
      const content = document.getElementById('analysisReportContent');
      if (!wrapper || !content || !report) return;
      const { metrics, allocation, recommendations, summary, insights } = report;
      wrapper.style.display = 'block';
      this.destroyAnalysisAllocChart();

      content.innerHTML = `
        <div class="form-row" style="gap:16px; flex-wrap:wrap;">
          <div class="chart-container" style="min-width:220px; flex:1;">
            <h4>총자산</h4>
            <div style="font-size:22px; font-weight:700;">${this.formatCurrency(metrics.total_assets)}</div>
          </div>
          <div class="chart-container" style="min-width:220px; flex:1;">
            <h4>비상자금</h4>
            <div style="font-size:18px;">${metrics.emergency_months}개월 / 목표 ${metrics.emergency_target_months}개월</div>
            ${metrics.emergency_gap > 0 ? `<div style="color: var(--text-secondary); font-size:13px;">부족액 ${this.formatCurrency(metrics.emergency_gap)}</div>` : ''}
          </div>
          <div class="chart-container" style="min-width:220px; flex:1;">
            <h4>저축률</h4>
            <div style="font-size:22px; font-weight:700;">${metrics.savings_rate}%</div>
          </div>
        </div>

        <div class="chart-container" style="margin-top:16px;">
          <h4>분석 요약</h4>
          <p style="color: var(--text-secondary); margin-top:6px;">${this.escapeHtml(summary || '')}</p>
          ${insights && insights.length ? `
            <ul style="margin-top:8px;">
              ${insights.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}
            </ul>
          ` : ''}
        </div>

        <div class="form-row" style="gap:16px; flex-wrap:wrap; margin-top:16px;">
          ${this.renderAnalysisAllocationCard('liquidity', allocation)}
          ${this.renderAnalysisAllocationCard('equity', allocation)}
          ${this.renderAnalysisAllocationCard('real_estate', allocation)}
          ${this.renderAnalysisAllocationCard('gold', allocation)}
        </div>

        <div class="chart-container" style="margin-top:16px;">
          <h4>자산배분 비교 차트 (현재 vs 목표)</h4>
          <div class="chart-canvas chart-canvas--analysis-allocation">
            <canvas id="analysisAllocChart"></canvas>
          </div>
        </div>

        <div style="margin-top:16px;">
          <h4>추천 액션</h4>
          <ul>
            ${recommendations.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `;

      this.renderAnalysisAllocationChart(allocation);
    },

    renderAnalysisAiReport(result) {
      const wrapper = document.getElementById('analysisAiReport');
      const content = document.getElementById('analysisAiReportContent');
      if (!wrapper || !content || !result || !result.report) return;

      const report = result.report;
      const model = this.toStringValue(result.model) || '-';
      const generatedAt = this.formatTimestamp(result.generatedAt);
      const strengths = this.ensureStringArray(report.strengths);
      const risks = this.ensureStringArray(report.risks);
      const actions30d = this.ensureStringArray(report.actions_30d);
      const actions90d = this.ensureStringArray(report.actions_90d);

      wrapper.style.display = 'block';
      content.innerHTML = `
        <div class="analysis-ai-meta">
          <span>모델: <strong>${this.escapeHtml(model)}</strong></span>
          <span>생성시각: <strong>${this.escapeHtml(generatedAt)}</strong></span>
        </div>

        <div class="analysis-ai-summary">
          <h4>요약</h4>
          <p>${this.escapeHtml(this.toStringValue(report.summary) || '-')}</p>
        </div>

        <div class="analysis-ai-grid">
          ${this.renderAnalysisAiListCard('강점', strengths, 'strength')}
          ${this.renderAnalysisAiListCard('리스크', risks, 'risk')}
          ${this.renderAnalysisAiListCard('30일 액션', actions30d, 'action')}
          ${this.renderAnalysisAiListCard('90일 액션', actions90d, 'action')}
        </div>

        <div class="analysis-ai-summary">
          <h4>배분 코멘트</h4>
          <p>${this.escapeHtml(this.toStringValue(report.allocation_commentary) || '-')}</p>
        </div>
        <div class="form-hint" style="margin-top:8px;">
          ${this.escapeHtml(this.toStringValue(report.disclaimer) || '본 결과는 참고용이며 투자자문이 아닙니다.')}
        </div>
      `;
    },

    renderAnalysisAiListCard(title, items, variant) {
      const rows = this.ensureStringArray(items);
      const klass = `analysis-ai-list ${variant || 'info'}`;
      const listHtml = rows.length ? rows.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('') : '<li>-</li>';
      return `
        <div class="${klass}">
          <h4>${this.escapeHtml(title)}</h4>
          <ul>${listHtml}</ul>
        </div>
      `;
    },

    renderAnalysisAllocationCard(key, allocation) {
      const labels = {
        liquidity: '현금성',
        equity: '투자성',
        real_estate: '부동산',
        gold: '금',
      };
      const current = Number((allocation.current[key] || 0).toFixed(1));
      const target = Number((allocation.target[key] || 0).toFixed(1));

      return `
        <div class="chart-container" style="min-width:220px; flex:1;">
          <h4>${labels[key]}</h4>
          <div style="font-size:13px; color: var(--text-secondary);">현재 ${current}% · 목표 ${target}%</div>
          <div style="margin-top:8px;">
            <div style="height:8px; background: var(--border-color); border-radius:4px; overflow:hidden;">
              <div style="width:${current}%; height:8px; background: var(--accent-blue);"></div>
            </div>
            <div style="height:6px;"></div>
            <div style="height:8px; background: var(--border-color); border-radius:4px; overflow:hidden;">
              <div style="width:${target}%; height:8px; background: var(--accent-green);"></div>
            </div>
          </div>
        </div>
      `;
    },

    renderAnalysisAllocationChart(allocation) {
      const canvas = document.getElementById('analysisAllocChart');
      if (!canvas || typeof Chart === 'undefined') return;
      const ctx = canvas.getContext('2d');

      this.destroyAnalysisAllocChart();

      this.analysisAllocChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['현금성', '투자성', '부동산', '금'],
          datasets: [
            {
              label: '현재',
              data: [
                allocation.current.liquidity || 0,
                allocation.current.equity || 0,
                allocation.current.real_estate || 0,
                allocation.current.gold || 0,
              ],
              backgroundColor: 'rgba(59, 130, 246, 0.6)',
            },
            {
              label: '목표',
              data: [
                allocation.target.liquidity || 0,
                allocation.target.equity || 0,
                allocation.target.real_estate || 0,
                allocation.target.gold || 0,
              ],
              backgroundColor: 'rgba(16, 185, 129, 0.6)',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 250,
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => `${value}%`,
              },
            },
          },
          plugins: {
            legend: { position: 'bottom' },
          },
        },
      });
    },

    destroyAnalysisAllocChart() {
      if (!this.analysisAllocChart) return;
      this.analysisAllocChart.destroy();
      this.analysisAllocChart = null;
    },

    getAgeFromRange(ageRange) {
      const map = {
        '20s': 25,
        '30s': 35,
        '40s': 43,
        '50s': 53,
        '60s': 62,
      };
      return map[ageRange] || 43;
    },

    bindAssetFilterEvents() {
      const search = document.getElementById('assetSearchInput');
      const type = document.getElementById('assetTypeFilter');
      const reset = document.getElementById('assetFilterReset');

      if (search) {
        search.addEventListener('input', () => {
          this.state.filterText = search.value || '';
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }

      if (type) {
        type.addEventListener('change', () => {
          this.state.filterType = type.value || 'all';
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }

      if (reset) {
        reset.addEventListener('click', () => {
          this.state.filterText = '';
          this.state.filterType = 'all';
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }
    },

    renderManualAssetEditor() {
      const draftRaw = this.state.manualAssetDraft || this.createDefaultManualAssetDraft();
      const selectedType = this.normalizeAssetType(draftRaw.type || 'other');
      const draft = {
        ...this.createDefaultManualAssetDraft(),
        ...draftRaw,
        type: selectedType,
      };
      const errorHtml = this.state.manualAssetError
        ? `<div class="form-error" style="margin-top:8px; margin-bottom:0;">${this.escapeHtml(this.state.manualAssetError)}</div>`
        : '';
      const typeOptionHint = this.getManualTypeOptionHint(selectedType);

      return `
        <form id="manualAssetForm" class="asset-manual-form">
          <div class="asset-manual-grid">
            <div>
              <label class="form-label" for="manualAssetName">자산명 *</label>
              <input id="manualAssetName" class="form-input" data-manual-field="name" type="text" value="${this.escapeHtml(draft.name || '')}" placeholder="예: 삼성전자" />
            </div>
            <div>
              <label class="form-label" for="manualAssetType">자산타입 *</label>
              <select id="manualAssetType" class="form-select" data-manual-field="type">
                ${this.renderTypeSelectOptions(draft.type || 'stock')}
              </select>
            </div>
            <div>
              <label class="form-label" for="manualAssetValuation">평가금액 *</label>
              <div class="analysis-input">
                <input id="manualAssetValuation" class="form-input" data-manual-field="valuation" type="number" step="any" value="${this.escapeHtml(
                  draft.valuation || ''
                )}" placeholder="예: 1000000" />
                <div class="form-hint" id="manualAssetValuationWords"></div>
              </div>
            </div>
            <div>
              <label class="form-label" for="manualAssetCurrency">통화</label>
              <select id="manualAssetCurrency" class="form-select" data-manual-field="currency">
                ${this.renderCurrencySelectOptions(draft.currency || 'KRW')}
              </select>
            </div>
            <div>
              <label class="form-label" for="manualAssetOwner">소유자</label>
              <input id="manualAssetOwner" class="form-input" data-manual-field="owner" type="text" value="${this.escapeHtml(draft.owner || '')}" placeholder="예: 본인" />
            </div>
            ${this.renderManualTypeOptionFields(selectedType, draft)}
          </div>
          <div class="form-row asset-manual-actions">
            <button id="manualAssetAddBtn" type="submit" class="btn btn-primary">자산 추가</button>
          </div>
          <div class="form-hint">${this.escapeHtml(typeOptionHint)}</div>
          ${errorHtml}
        </form>
      `;
    },

    renderManualTypeOptionFields(type, draft) {
      if (MARKET_OPTION_TYPES.includes(type)) {
        return `
          <div>
            <label class="form-label" for="manualAssetTicker">티커</label>
            <input id="manualAssetTicker" class="form-input" data-manual-field="ticker" type="text" value="${this.escapeHtml(draft.ticker || '')}" placeholder="예: TSLA" />
          </div>
          <div>
            <label class="form-label" for="manualAssetMarket">시장</label>
            <input id="manualAssetMarket" class="form-input" data-manual-field="market" type="text" value="${this.escapeHtml(draft.market || '')}" placeholder="예: NASDAQ" />
          </div>
          <div>
            <label class="form-label" for="manualAssetQuantity">수량(옵션)</label>
            <input id="manualAssetQuantity" class="form-input" data-manual-field="quantity" type="number" step="any" value="${this.escapeHtml(draft.quantity || '')}" placeholder="예: 12.5" />
          </div>
          <div>
            <label class="form-label" for="manualAssetManualPrice">현재가 1주(옵션)</label>
            <input id="manualAssetManualPrice" class="form-input" data-manual-field="manualPrice" type="number" step="any" value="${this.escapeHtml(
              draft.manualPrice || ''
            )}" placeholder="예: 120000" />
          </div>
        `;
      }

      if (BANK_OPTION_TYPES.includes(type)) {
        return `
          <div>
            <label class="form-label" for="manualAssetBankName">기관명(옵션)</label>
            <input id="manualAssetBankName" class="form-input" data-manual-field="bankName" type="text" value="${this.escapeHtml(draft.bankName || '')}" placeholder="예: 국민은행" />
          </div>
          <div>
            <label class="form-label" for="manualAssetAccountNumber">계좌/계약번호(옵션)</label>
            <input id="manualAssetAccountNumber" class="form-input" data-manual-field="accountNumber" type="text" value="${this.escapeHtml(
              draft.accountNumber || ''
            )}" placeholder="예: 123-456-7890" />
          </div>
          <div>
            <label class="form-label" for="manualAssetInterestRatePct">금리(연, %)</label>
            <input id="manualAssetInterestRatePct" class="form-input" data-manual-field="interestRatePct" type="number" step="any" value="${this.escapeHtml(
              draft.interestRatePct || ''
            )}" placeholder="예: 3.2" />
          </div>
          <div>
            <label class="form-label" for="manualAssetMaturityDate">만기일</label>
            <input id="manualAssetMaturityDate" class="form-input" data-manual-field="maturityDate" type="date" value="${this.escapeHtml(
              draft.maturityDate || ''
            )}" />
          </div>
        `;
      }

      if (type === 'real_estate') {
        return `
          <div>
            <label class="form-label" for="manualAssetMarket">지역/시장(옵션)</label>
            <input id="manualAssetMarket" class="form-input" data-manual-field="market" type="text" value="${this.escapeHtml(draft.market || '')}" placeholder="예: 서울" />
          </div>
        `;
      }

      return '';
    },

    getManualTypeOptionHint(type) {
      if (MARKET_OPTION_TYPES.includes(type)) {
        return '필수값은 자산명/자산타입/평가금액입니다. 수량과 현재가를 같이 입력하면 평가금액이 비어있을 때 자동 계산됩니다.';
      }
      if (type === 'liability') {
        return '필수값은 자산명/자산타입/평가금액입니다. 부채는 평가금액을 양수로 입력하면 저장 시 자동으로 음수 변환되며, 기관명/계좌번호/금리/만기일 옵션을 입력할 수 있습니다.';
      }
      if (BANK_OPTION_TYPES.includes(type)) {
        return '필수값은 자산명/자산타입/평가금액입니다. 예금/보험/연금은 기관명, 계좌번호, 금리, 만기일 옵션을 입력할 수 있습니다.';
      }
      if (type === 'real_estate') {
        return '필수값은 자산명/자산타입/평가금액입니다. 부동산은 지역/시장 정보를 옵션으로 기록할 수 있습니다.';
      }
      return '필수값은 자산명/자산타입/평가금액입니다.';
    },

    bindAssetCrudEvents() {
      const manualForm = document.getElementById('manualAssetForm');
      if (manualForm) {
        const syncDraftField = (target, rerenderOnType = false) => {
          const field = target?.dataset?.manualField;
          if (!field) return;
          const nextDraft = { ...(this.state.manualAssetDraft || this.createDefaultManualAssetDraft()) };
          nextDraft[field] = target.value || '';
          this.state.manualAssetDraft = nextDraft;
          if (this.state.manualAssetError) this.state.manualAssetError = '';

          if (rerenderOnType && field === 'type') {
            this.renderAssetsPage(document.getElementById('page-content'));
          }
        };

        manualForm.addEventListener('input', (event) => {
          syncDraftField(event.target, false);
        });

        manualForm.addEventListener('change', (event) => {
          syncDraftField(event.target, true);
        });

        manualForm.addEventListener('submit', (event) => {
          event.preventDefault();
          this.addManualAsset();
        });
      }

      const table = document.getElementById('assetsTable');
      if (table) {
        table.addEventListener('click', (event) => {
          const button = event.target.closest('.asset-delete-btn');
          if (!button) return;
          const index = Number(button.dataset.assetIndex || '');
          if (!Number.isInteger(index) || index < 0) return;
          this.deleteAssetByIndex(index);
        });
      }
    },

    addManualAsset() {
      const draft = this.state.manualAssetDraft || this.createDefaultManualAssetDraft();
      const name = this.toStringValue(draft.name);
      const type = this.normalizeAssetType(draft.type || 'other');
      const valuationDirect = this.toNumber(draft.valuation);
      const quantity = this.toNumber(draft.quantity);
      const manualPrice = this.toNumber(draft.manualPrice);
      const derivedValuation =
        quantity !== null && manualPrice !== null && quantity > 0 && manualPrice > 0 ? quantity * manualPrice : null;
      const useDerivedValuation = (valuationDirect === null || valuationDirect === 0) && MARKET_OPTION_TYPES.includes(type) && derivedValuation !== null;
      const valuationInput = useDerivedValuation ? derivedValuation : valuationDirect;
      const currency = this.normalizeJsonCurrency(draft.currency).currency;
      const ticker = MARKET_OPTION_TYPES.includes(type) ? this.toStringValue(draft.ticker) : null;
      const market = MARKET_OPTION_TYPES.includes(type) || type === 'real_estate' ? this.toStringValue(draft.market) : null;
      const bankName = BANK_OPTION_TYPES.includes(type) ? this.toStringValue(draft.bankName) : null;
      const accountNumber = BANK_OPTION_TYPES.includes(type) ? this.toStringValue(draft.accountNumber) : null;
      const interestRatePct = BANK_OPTION_TYPES.includes(type) ? this.toNumber(draft.interestRatePct) : null;
      const maturityDate = BANK_OPTION_TYPES.includes(type) ? this.toStringValue(draft.maturityDate) : null;

      if (!name) {
        this.state.manualAssetError = '자산명을 입력해주세요.';
        this.renderAssetsPage(document.getElementById('page-content'));
        return;
      }

      if (valuationInput === null || valuationInput === 0) {
        this.state.manualAssetError = '평가금액은 0이 아닌 숫자여야 합니다.';
        this.renderAssetsPage(document.getElementById('page-content'));
        return;
      }

      if (type !== 'liability' && valuationInput < 0) {
        this.state.manualAssetError = '비부채 타입은 평가금액을 양수로 입력해주세요.';
        this.renderAssetsPage(document.getElementById('page-content'));
        return;
      }

      const valuation = type === 'liability' ? -Math.abs(valuationInput) : valuationInput;
      const asset = {
        id: this.generateAssetId({ type, name }),
        name,
        type,
        currency,
        valueInput: type === 'liability' ? Math.abs(valuation) : valuation,
        valuationDisplay: valuation,
        quantity: MARKET_OPTION_TYPES.includes(type) ? quantity : null,
        manualPrice: MARKET_OPTION_TYPES.includes(type) ? manualPrice : null,
        owner: this.toStringValue(draft.owner),
        ticker,
        market,
        avgCost: null,
        bankName,
        accountNumber,
        interestRatePct,
        maturityDate,
      };

      asset.valuation = this.computeAssetValuation(asset);
      this.state.assets = [...this.state.assets, asset];
      this.state.dashboard = this.buildDashboard(this.state.assets, null);
      this.refreshAnalysisReportIfExists();
      this.saveDataSnapshot();
      this.state.message = useDerivedValuation
        ? `자산 추가 완료: ${asset.name} (수량×현재가로 평가금액 자동 계산)`
        : `자산 추가 완료: ${asset.name}`;
      this.state.messageType = 'info';
      this.resetManualAssetDraft();
      this.renderDataToolbar();
      this.renderAssetsPage(document.getElementById('page-content'));
    },

    deleteAssetByIndex(index) {
      if (!Array.isArray(this.state.assets) || index < 0 || index >= this.state.assets.length) return;
      const target = this.state.assets[index];
      const confirmed = window.confirm(`자산을 삭제하시겠습니까?\n${target?.name || '이름 없음'}`);
      if (!confirmed) return;

      this.state.assets.splice(index, 1);
      this.state.assets = this.state.assets.slice();
      this.state.dashboard = this.buildDashboard(this.state.assets, null);
      this.refreshAnalysisReportIfExists();
      this.saveDataSnapshot();
      this.state.message = `자산 삭제 완료: ${target?.name || '-'}`;
      this.state.messageType = 'info';
      this.renderDataToolbar();
      this.renderAssetsPage(document.getElementById('page-content'));
    },

    renderAssetsTable(assets) {
      return `
        <div style="overflow-x:auto;">
          <table class="audit-table" id="assetsTable">
            <thead>
              <tr>
                <th>자산명</th>
                <th>자산타입</th>
                <th>통화</th>
                <th class="align-right">평가금액</th>
                <th class="align-right">원금/평가금액</th>
                <th class="align-right">수량</th>
                <th class="align-right">현재가(수동)</th>
                <th>소유자</th>
                <th>티커</th>
                <th>시장</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${assets
                .map((asset) => {
                  const assetIndex = this.state.assets.indexOf(asset);
                  return `
                <tr>
                  <td>${this.escapeHtml(asset.name || '-')}</td>
                  <td>${this.escapeHtml(this.getAssetTypeLabel(asset.type))}</td>
                  <td>${this.escapeHtml(asset.currency || 'KRW')}</td>
                  <td class="num-cell">${this.formatCurrency(asset.valuation, asset.currency)}</td>
                  <td class="num-cell">${this.formatCurrency(asset.valueInput, asset.currency)}</td>
                  <td class="num-cell">${this.formatNumber(asset.quantity)}</td>
                  <td class="num-cell">${this.formatCurrency(asset.manualPrice, asset.currency)}</td>
                  <td>${this.escapeHtml(asset.owner || '-')}</td>
                  <td>${this.escapeHtml(asset.ticker || '-')}</td>
                  <td>${this.escapeHtml(asset.market || '-')}</td>
                  <td>
                    <button type="button" class="btn btn-secondary btn-compact asset-delete-btn" data-asset-index="${assetIndex}" ${
                      assetIndex < 0 ? 'disabled' : ''
                    }>삭제</button>
                  </td>
                </tr>
              `
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    },

    renderJsonImporter() {
      const draft = this.escapeHtml(this.state.jsonDraft || '');
      const prompt = this.escapeHtml(this.getJsonAssetPrompt());
      const summary = this.state.jsonPreviewSummary
        ? `<div class="form-hint" style="margin-top:8px;">총 ${this.state.jsonPreviewSummary.total}건, 유효 ${this.state.jsonPreviewSummary.valid}건, 오류 ${this.state.jsonPreviewSummary.invalid}건, 기타 폴백 ${this.state.jsonPreviewSummary.fallback}건</div>`
        : '';
      const status = this.state.jsonStatus
        ? `<div class="json-import-status ${this.state.jsonStatusType === 'error' ? 'is-error' : 'is-success'}">${this.escapeHtml(this.state.jsonStatus)}</div>`
        : '';
      const applyDisabled = this.state.jsonValidRows.length ? '' : 'disabled';
      const editableHint = this.state.jsonPreviewRows.length
        ? `<div class="form-hint" style="margin-top:6px;">미리보기 표에서 자산명/타입/평가금액/통화를 수정하면 즉시 재검증됩니다.</div>`
        : '';

      return `
        <div class="asset-json-importer">
          <p class="form-hint" style="margin-top:0;">자산 화면 캡처 + 프롬프트를 외부 AI(ChatGPT/Copilot 등)에 전달해 JSON을 생성한 뒤 붙여넣으세요.</p>
          <div class="asset-json-prompt-card">
            <div class="asset-json-prompt-header">
              <strong>외부 LLM 프롬프트</strong>
              <button id="copyJsonPromptBtn" type="button" class="btn btn-secondary btn-compact">프롬프트 복사</button>
            </div>
            <pre class="asset-json-prompt-body">${prompt}</pre>
          </div>

          <label class="form-label" for="assetJsonInput" style="margin-top:10px;">JSON 입력</label>
          <textarea id="assetJsonInput" class="form-input asset-json-textarea" placeholder='{"assets":[{"name":"...", "type":"stock", "valuation":1000000}]}' >${draft}</textarea>

          <div class="form-row" style="margin-top:10px; margin-bottom:0;">
            <button id="previewJsonBtn" type="button" class="btn btn-secondary">미리보기</button>
            <button id="applyJsonBtn" type="button" class="btn btn-primary" ${applyDisabled}>자산 반영</button>
          </div>

          ${status}
          ${summary}
          ${editableHint}
          ${this.renderJsonPreviewTable()}
        </div>
      `;
    },

    renderJsonPreviewTable() {
      if (!this.state.jsonPreviewRows.length) return '';

      return `
        <div class="asset-json-preview-wrap">
          <table class="audit-table asset-json-preview-table" id="jsonPreviewTable">
            <thead>
              <tr>
                <th>행</th>
                <th>상태</th>
                <th>자산명</th>
                <th>자산타입</th>
                <th>평가금액</th>
                <th>통화</th>
                <th>티커</th>
                <th>메시지</th>
              </tr>
            </thead>
            <tbody>
              ${this.state.jsonPreviewRows
                .map((row) => {
                  const badgeClass = row.valid ? (row.typeFallback ? 'is-fallback' : 'is-valid') : 'is-invalid';
                  const badgeText = row.valid ? (row.typeFallback ? '기타 폴백' : '유효') : '오류';
                  return `
                    <tr>
                      <td>${row.rowNo}</td>
                      <td><span class="asset-json-status-badge ${badgeClass}">${badgeText}</span></td>
                      <td><input class="form-input asset-json-cell-input" type="text" data-json-row-no="${row.rowNo}" data-json-field="name" value="${this.escapeHtml(row.source.name || '')}" /></td>
                      <td>
                        <select class="form-select asset-json-cell-select" data-json-row-no="${row.rowNo}" data-json-field="type">
                          ${this.renderTypeSelectOptions(row.type)}
                        </select>
                      </td>
                      <td><input class="form-input asset-json-cell-input asset-json-cell-input-num" type="number" data-json-row-no="${row.rowNo}" data-json-field="valuation" value="${row.source.valuation === null ? '' : this.escapeHtml(String(row.source.valuation))}" /></td>
                      <td>
                        <select class="form-select asset-json-cell-select" data-json-row-no="${row.rowNo}" data-json-field="currency">
                          ${this.renderCurrencySelectOptions(row.currency)}
                        </select>
                      </td>
                      <td><input class="form-input asset-json-cell-input" type="text" data-json-row-no="${row.rowNo}" data-json-field="ticker" value="${this.escapeHtml(row.source.ticker || '')}" /></td>
                      <td>${this.escapeHtml(row.message || '-')}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    },

    bindJsonImporterEvents() {
      const copyBtn = document.getElementById('copyJsonPromptBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const ok = await this.copyToClipboard(this.getJsonAssetPrompt());
          this.state.jsonStatus = ok ? '프롬프트를 복사했습니다.' : '프롬프트 복사에 실패했습니다.';
          this.state.jsonStatusType = ok ? 'info' : 'error';
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }

      const input = document.getElementById('assetJsonInput');
      if (input) {
        input.addEventListener('input', () => {
          this.state.jsonDraft = input.value || '';
          this.state.jsonPreviewRows = [];
          this.state.jsonValidRows = [];
          this.state.jsonPreviewSummary = null;
          this.state.jsonStatus = '';
          this.state.jsonStatusType = 'info';
          const applyBtn = document.getElementById('applyJsonBtn');
          if (applyBtn) applyBtn.disabled = true;
        });
      }

      const previewBtn = document.getElementById('previewJsonBtn');
      if (previewBtn) {
        previewBtn.addEventListener('click', () => {
          const raw = (document.getElementById('assetJsonInput')?.value || '').trim();
          this.state.jsonDraft = raw;
          const parsed = this.parseJsonAssetInput(raw);
          if (parsed.error) {
            this.state.jsonPreviewRows = [];
            this.state.jsonValidRows = [];
            this.state.jsonPreviewSummary = null;
            this.state.jsonStatus = parsed.error;
            this.state.jsonStatusType = 'error';
            this.renderAssetsPage(document.getElementById('page-content'));
            return;
          }

          const preview = this.buildJsonPreview(parsed.items);
          this.state.jsonPreviewRows = preview.rows;
          this.state.jsonValidRows = preview.validRows;
          this.state.jsonPreviewSummary = preview.summary;
          this.state.jsonStatus = '';
          this.state.jsonStatusType = 'info';
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }

      const applyBtn = document.getElementById('applyJsonBtn');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          if (!this.state.jsonValidRows.length) {
            this.state.jsonStatus = '반영 가능한 유효 행이 없습니다.';
            this.state.jsonStatusType = 'error';
            this.renderAssetsPage(document.getElementById('page-content'));
            return;
          }

          const result = this.applyJsonRowsToAssets(this.state.jsonValidRows);
          this.state.jsonStatus = `반영 완료: 신규 ${result.created}건, 수정 ${result.updated}건`;
          this.state.jsonStatusType = 'info';
          this.state.jsonPreviewRows = [];
          this.state.jsonValidRows = [];
          this.state.jsonPreviewSummary = null;
          this.state.jsonDraft = '';
          this.state.message = 'JSON 입력 결과가 자산 목록에 반영되었습니다.';
          this.state.messageType = 'info';
          this.renderDataToolbar();
          this.renderAssetsPage(document.getElementById('page-content'));
        });
      }

      const exportBtn = document.getElementById('exportAssetsExcelBtn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          this.exportAssetsToExcel();
        });
      }

      const previewTable = document.getElementById('jsonPreviewTable');
      if (previewTable) {
        previewTable.addEventListener('change', (event) => {
          const target = event.target;
          if (!target || !target.dataset) return;
          const rowNo = Number(target.dataset.jsonRowNo || '');
          const field = (target.dataset.jsonField || '').trim();
          if (!rowNo || !field) return;
          this.updateJsonPreviewRow(rowNo, field, target.value);
        });
      }
    },

    getJsonAssetPrompt() {
      return [
        'Extract asset records from the image and return JSON only.',
        'Output schema:',
        '{"assets":[{"name":"", "type":"stock|etf|deposit|cash|gold|real_estate|crypto|bond|fund|pension|insurance|liability|other", "valuation":0, "currency":"KRW", "ticker":"", "market":"", "note":""}]}',
        'Rules:',
        '- Required: name, type, valuation',
        '- valuation means current total asset value, NOT profit/loss',
        '- If type is unknown, set type to "other"',
        '- valuation should be a positive number (> 0)',
        '- If type is liability, still output positive amount (the app converts it to negative internally)',
        '- Return pure JSON only (no markdown or explanation)',
      ].join('\n');
    },

    async copyToClipboard(text) {
      const raw = String(text || '');
      if (!raw) return false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(raw);
          return true;
        }
      } catch (error) {
        console.warn('Clipboard API failed:', error);
      }

      try {
        const ta = document.createElement('textarea');
        ta.value = raw;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (error) {
        console.warn('Fallback copy failed:', error);
        return false;
      }
    },

    parseJsonAssetInput(rawText) {
      const raw = (rawText || '').trim();
      if (!raw) return { error: 'JSON 입력이 비어 있습니다.', items: [] };

      const unfenced = this.stripJsonCodeFence(raw);
      const normalized = this.normalizeJsonInputQuotes(unfenced);
      let parsed;
      try {
        parsed = JSON.parse(unfenced);
      } catch (firstError) {
        try {
          parsed = JSON.parse(normalized);
        } catch (secondError) {
          return { error: 'JSON 형식이 올바르지 않습니다.', items: [] };
        }
      }

      if (Array.isArray(parsed)) return { error: null, items: parsed };
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.assets)) {
        return { error: null, items: parsed.assets };
      }
      return { error: '루트는 배열 또는 {"assets":[...]} 형식이어야 합니다.', items: [] };
    },

    stripJsonCodeFence(raw) {
      const trimmed = (raw || '').trim();
      const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fenced && fenced[1]) return fenced[1].trim();
      return trimmed;
    },

    normalizeJsonInputQuotes(raw) {
      return String(raw || '')
        .replace(/[“”＂]/g, '"')
        .replace(/[‘’＇]/g, "'");
    },

    buildJsonPreview(items) {
      const rows = [];
      for (let i = 0; i < items.length; i += 1) {
        rows.push(this.normalizeJsonPreviewRow(items[i], i + 1));
      }
      const state = this.computeJsonPreviewState(rows);
      return { rows, validRows: state.validRows, summary: state.summary };
    },

    computeJsonPreviewState(rows) {
      const list = Array.isArray(rows) ? rows : [];
      const validRows = list.filter((row) => row.valid);
      return {
        validRows,
        summary: {
          total: list.length,
          valid: validRows.length,
          invalid: list.filter((row) => !row.valid).length,
          fallback: list.filter((row) => row.valid && row.typeFallback).length,
        },
      };
    },

    normalizeJsonPreviewRow(rawItem, rowNo) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        return {
          rowNo,
          valid: false,
          typeFallback: false,
          name: '',
          type: 'other',
          valuation: null,
          currency: 'KRW',
          ticker: '',
          market: '',
          source: { name: '', type: 'other', valuation: '', currency: 'KRW', ticker: '', market: '' },
          message: '객체 행만 지원합니다.',
        };
      }

      const nameRaw = this.getValueByAliases(rawItem, ['name', 'asset_name', 'assetName', '자산명', '자산 이름']);
      const typeRaw = this.getValueByAliases(rawItem, ['type', 'asset_type', 'assetType', '자산타입', '자산 타입']);
      const valuationRaw = this.getValueByAliases(rawItem, ['valuation', 'value', 'asset_value', '평가금액', '평가 금액']);
      const currencyRaw = this.getValueByAliases(rawItem, ['currency', '통화']);
      const tickerRaw = this.getValueByAliases(rawItem, ['ticker', 'symbol', '티커', '종목코드']);
      const marketRaw = this.getValueByAliases(rawItem, ['market', '거래소', '시장']);

      const name = this.toStringValue(nameRaw) || '';
      const typeInfo = this.normalizeJsonAssetType(typeRaw);
      const valuation = this.toNumber(valuationRaw);
      const currencyInfo = this.normalizeJsonCurrency(currencyRaw);
      const ticker = this.toStringValue(tickerRaw) || '';
      const market = this.toStringValue(marketRaw) || '';

      const errors = [];
      if (!name) errors.push('자산명이 없습니다.');
      if (!this.toStringValue(typeRaw)) errors.push('자산 타입이 없습니다.');
      if (valuation === null || valuation === 0) errors.push('평가금액은 0이 아닌 숫자여야 합니다.');
      if (valuation !== null && typeInfo.type !== 'liability' && valuation < 0) errors.push('비부채 타입은 평가금액이 양수여야 합니다.');

      const valid = errors.length === 0;
      const message = errors.length
        ? errors.join(', ')
        : (typeInfo.fallback ? '타입 미일치로 other 처리' : '반영 가능');

      return {
        rowNo,
        valid,
        typeFallback: typeInfo.fallback,
        name,
        type: typeInfo.type,
        valuation,
        currency: currencyInfo.currency,
        ticker,
        market,
        source: {
          name,
          type: typeInfo.type,
          valuation: valuationRaw === null || valuationRaw === undefined ? '' : String(valuationRaw),
          currency: currencyRaw ? String(currencyRaw) : 'KRW',
          ticker,
          market,
        },
        message,
      };
    },

    updateJsonPreviewRow(rowNo, field, value) {
      const rows = this.state.jsonPreviewRows.slice();
      const index = rows.findIndex((row) => Number(row.rowNo) === Number(rowNo));
      if (index < 0) return;

      const current = rows[index];
      const source = {
        name: current.source?.name || '',
        type: current.source?.type || 'other',
        valuation: current.source?.valuation || '',
        currency: current.source?.currency || 'KRW',
        ticker: current.source?.ticker || '',
        market: current.source?.market || '',
      };
      source[field] = value;
      rows[index] = this.normalizeJsonPreviewRow(source, rowNo);

      const computed = this.computeJsonPreviewState(rows);
      this.state.jsonPreviewRows = rows;
      this.state.jsonValidRows = computed.validRows;
      this.state.jsonPreviewSummary = computed.summary;
      this.state.jsonStatus = '';
      this.state.jsonStatusType = 'info';
      this.renderAssetsPage(document.getElementById('page-content'));
    },

    normalizeJsonAssetType(rawType) {
      const raw = this.toStringValue(rawType);
      if (!raw) return { type: 'other', fallback: true };
      const normalized = this.normalizeAssetType(raw);
      if (ASSET_TYPE_LABELS[normalized]) {
        return { type: normalized, fallback: false };
      }
      return { type: 'other', fallback: true };
    },

    normalizeJsonCurrency(rawCurrency) {
      const raw = this.toStringValue(rawCurrency);
      if (!raw) return { currency: 'KRW' };
      const upper = raw.toUpperCase();
      if (CURRENCY_OPTIONS.includes(upper)) return { currency: upper };
      return { currency: 'KRW' };
    },

    getValueByAliases(row, aliases) {
      const entries = Object.entries(row || {});
      for (const alias of aliases) {
        const lowerAlias = String(alias).toLowerCase();
        for (const [key, value] of entries) {
          if (String(key).toLowerCase() !== lowerAlias) continue;
          if (value === null || value === undefined) continue;
          if (typeof value === 'string' && !value.trim()) continue;
          return value;
        }
      }
      return null;
    },

    renderTypeSelectOptions(selectedType) {
      const selected = selectedType || 'other';
      return Object.keys(ASSET_TYPE_LABELS)
        .map((type) => `<option value="${this.escapeHtml(type)}" ${type === selected ? 'selected' : ''}>${this.escapeHtml(ASSET_TYPE_LABELS[type])}</option>`)
        .join('');
    },

    renderCurrencySelectOptions(selectedCurrency) {
      const selected = (selectedCurrency || 'KRW').toUpperCase();
      return CURRENCY_OPTIONS.map((currency) => `<option value="${currency}" ${currency === selected ? 'selected' : ''}>${currency}</option>`).join('');
    },

    applyJsonRowsToAssets(rows) {
      const list = this.state.assets.slice();
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const patch = this.mapJsonRowToAssetPatch(row);
        const idx = this.findMatchingAssetIndex(list, patch);
        if (idx >= 0) {
          const current = list[idx];
          const merged = {
            ...current,
            name: patch.name,
            type: patch.type,
            currency: patch.currency,
            valueInput: patch.valueInput,
            valuationDisplay: patch.valuationDisplay,
            quantity: patch.quantity,
            manualPrice: patch.manualPrice,
            valuation: patch.valuation,
          };
          if (patch.ticker !== undefined) merged.ticker = patch.ticker;
          if (patch.market !== undefined) merged.market = patch.market;
          list[idx] = merged;
          updated += 1;
        } else {
          list.push({
            id: this.generateAssetId(patch),
            name: patch.name,
            type: patch.type,
            currency: patch.currency,
            valueInput: patch.valueInput,
            valuationDisplay: patch.valuationDisplay,
            quantity: patch.quantity,
            manualPrice: patch.manualPrice,
            owner: null,
            ticker: patch.ticker || null,
            market: patch.market || null,
            avgCost: null,
            bankName: null,
            accountNumber: null,
            valuation: patch.valuation,
          });
          created += 1;
        }
      }

      list.forEach((asset) => {
        asset.valuation = this.computeAssetValuation(asset);
      });

      this.state.assets = list;
      this.state.dashboard = this.buildDashboard(list, null);
      this.refreshAnalysisReportIfExists();
      this.saveDataSnapshot();
      return { created, updated };
    },

    mapJsonRowToAssetPatch(row) {
      const valuationRaw = Number(row.valuation || 0);
      const valuation = row.type === 'liability' ? -Math.abs(valuationRaw) : valuationRaw;
      return {
        name: row.name,
        type: row.type,
        currency: row.currency || 'KRW',
        valueInput: row.type === 'liability' ? Math.abs(valuation) : valuation,
        valuationDisplay: valuation,
        valuation,
        quantity: null,
        manualPrice: null,
        ticker: this.toStringValue(row.ticker),
        market: this.toStringValue(row.market),
      };
    },

    findMatchingAssetIndex(list, patch) {
      return list.findIndex((asset) => {
        const sameName = (asset.name || '').trim() === (patch.name || '').trim();
        const sameType = (asset.type || '') === (patch.type || '');
        if (!sameName || !sameType) return false;

        const existingTicker = (asset.ticker || '').trim().toUpperCase();
        const patchTicker = (patch.ticker || '').trim().toUpperCase();
        if (existingTicker === patchTicker) return true;
        if (!patchTicker) return true;
        if (!existingTicker && patchTicker) return true;
        return false;
      });
    },

    generateAssetId(patch) {
      const base = `${patch.type || 'other'}_${patch.name || 'asset'}_${Date.now()}`;
      return base.replace(/\s+/g, '_');
    },

    exportAssetsToExcel() {
      if (!this.state.assets.length) {
        this.state.message = '저장할 자산이 없습니다.';
        this.state.messageType = 'error';
        this.renderDataToolbar();
        return;
      }

      const workbook = XLSX.utils.book_new();
      const assetsRows = this.buildAssetsSheetRows(this.state.assets);
      const dashboardRows = this.buildDashboardSheetRows(this.state.dashboard || this.buildDashboard(this.state.assets, null));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(assetsRows), 'Assets');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(dashboardRows), 'Dashboard');

      const now = new Date();
      const filename = `asset_monitoring_web_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(
        now.getSeconds()
      ).padStart(2, '0')}.xlsx`;

      XLSX.writeFile(workbook, filename);
      this.state.message = `엑셀 저장 완료: ${filename}`;
      this.state.messageType = 'info';
      this.renderDataToolbar();
    },

    buildAssetsSheetRows(assets) {
      const headers = [
        '자산ID',
        '자산명',
        '자산타입',
        '통화',
        '원금평가금액',
        '평가금액KRW',
        '금리연',
        '만기일',
        '소유자',
        '티커',
        '시장',
        '수량',
        '현재가1주당수동',
        '평균단가',
        '은행명',
        '계좌번호',
      ];

      const rows = [headers];
      assets.forEach((asset, index) => {
        rows.push([
          asset.id || `asset_${index + 1}`,
          asset.name || '',
          asset.type || 'other',
          asset.currency || 'KRW',
          asset.valueInput ?? '',
          asset.valuation ?? '',
          asset.interestRatePct ?? '',
          asset.maturityDate || '',
          asset.owner || '',
          asset.ticker || '',
          asset.market || '',
          asset.quantity ?? '',
          asset.manualPrice ?? '',
          asset.avgCost ?? '',
          asset.bankName || '',
          asset.accountNumber || '',
        ]);
      });
      return rows;
    },

    buildDashboardSheetRows(dashboard) {
      const d = dashboard || { totalAssets: 0, totalLiabilities: 0, netWorth: 0, breakdown: {} };
      const rows = [
        ['Metric', 'Value'],
        ['TotalAssets', d.totalAssets || 0],
        ['TotalLiabilities', d.totalLiabilities || 0],
        ['NetWorth', d.netWorth || 0],
        [],
        ['AssetType', 'Valuation', 'WeightPct'],
      ];

      const entries = Object.entries(d.breakdown || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
      const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
      entries.forEach(([type, value]) => {
        const valuation = Number(value || 0);
        const weightPct = total > 0 ? (valuation / total) * 100 : 0;
        rows.push([type, valuation, Number(weightPct.toFixed(2))]);
      });
      return rows;
    },

    getFilteredAssets() {
      const text = this.state.filterText.trim().toLowerCase();
      const type = this.state.filterType;

      return this.state.assets
        .filter((asset) => {
          if (type !== 'all' && asset.type !== type) return false;
          if (!text) return true;

          const haystack = [asset.name, asset.ticker, asset.owner, asset.market]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(text);
        })
        .sort((a, b) => (b.valuation || 0) - (a.valuation || 0));
    },

    getTypeOptions() {
      return Array.from(new Set(this.state.assets.map((asset) => asset.type).filter(Boolean))).sort();
    },

    renderEmptyState(message, compact = false) {
      return `
        <div class="empty-state ${compact ? 'small' : ''}">
          <div class="empty-state-icon">📁</div>
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    },

    renderBreakdownLegend(breakdown) {
      const legend = document.getElementById('breakdownLegend');
      if (!legend) return;

      const items = this.getBreakdownItems(breakdown);
      if (!items.length) {
        legend.innerHTML = this.renderEmptyState('비중 차트를 그릴 데이터가 없습니다.', true);
        return;
      }

      legend.innerHTML = `
        <div class="breakdown-legend-grid">
          ${items
            .map(
              (item) => `
            <div class="breakdown-item">
              <span class="breakdown-color" style="background:${item.color};"></span>
              <div class="breakdown-info">
                <div class="breakdown-label">${this.escapeHtml(item.label)}</div>
                <div class="breakdown-meta">
                  <span class="breakdown-value">${this.formatCurrency(item.value)}</span>
                  <span class="breakdown-percent">${item.percent.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    },

    renderBreakdownChart(breakdown) {
      this.destroyBreakdownChart();

      const canvas = document.getElementById('breakdownChart');
      if (!canvas) return;

      const items = this.getBreakdownItems(breakdown);
      if (!items.length) return;
      const percents = items.map((item) => item.percent);

      this.breakdownChart = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: items.map((item) => item.label),
          datasets: [
            {
              data: items.map((item) => item.value),
              backgroundColor: items.map((item) => item.color),
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            piePercentLabel: {
              minPercent: 3,
              fontSize: 14,
              color: '#f8fafc',
              strokeColor: 'rgba(15, 23, 42, 0.75)',
              strokeWidth: 3,
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = Number(context.raw || 0);
                  const percent = Number(percents[context.dataIndex] || 0);
                  return `${context.label}: ${percent.toFixed(1)}% (${this.formatCurrency(value)})`;
                },
              },
            },
          },
        },
      });
    },

    destroyBreakdownChart() {
      if (!this.breakdownChart) return;
      this.breakdownChart.destroy();
      this.breakdownChart = null;
    },

    getBreakdownItems(breakdown) {
      const palette = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#06b6d4', '#0ea5e9', '#84cc16'];
      const entries = Object.entries(breakdown || {})
        .map(([type, value]) => [type, Number(value || 0)])
        .filter(([, value]) => Number.isFinite(value) && value > 0)
        .sort((a, b) => b[1] - a[1]);

      const total = entries.reduce((sum, [, value]) => sum + value, 0);
      if (!total) return [];

      return entries.map(([type, value], index) => ({
        type,
        value,
        label: this.getAssetTypeLabel(type),
        percent: (value / total) * 100,
        color: palette[index % palette.length],
      }));
    },

    async parseExcel(file) {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: true });

      const assets = this.parseAssetsSheet(workbook);
      const dashboardFromSheet = this.parseDashboardSheet(workbook);
      const dashboard = this.buildDashboard(assets, dashboardFromSheet);

      if (!assets.length && !dashboard) {
        throw new Error('자산 데이터 또는 대시보드 데이터를 찾지 못했습니다.');
      }

      return { assets, dashboard };
    },

    parseAssetsSheet(workbook) {
      const targetSheet = this.findAssetsSheet(workbook);
      if (!targetSheet) return [];

      const rows = XLSX.utils.sheet_to_json(targetSheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      });

      if (!rows.length) return [];

      const headerInfo = this.findHeaderRow(rows, {
        required: ['name', 'type'],
      });

      if (!headerInfo) return [];

      const assets = [];
      for (let rowIndex = headerInfo.headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        if (this.isRowEmpty(row)) continue;

        const name = this.toStringValue(this.getField(row, headerInfo.columnMap, 'name'));
        const rawType = this.toStringValue(this.getField(row, headerInfo.columnMap, 'type'));
        if (!name && !rawType) continue;
        if (!name || !rawType) continue;

        const type = this.normalizeAssetType(rawType);
        const currency = this.toStringValue(this.getField(row, headerInfo.columnMap, 'currency')) || 'KRW';
        const valueInput = this.toNumber(this.getField(row, headerInfo.columnMap, 'value_input'));
        const valuationDisplay = this.toNumber(this.getField(row, headerInfo.columnMap, 'valuation_display'));
        const quantity = this.toNumber(this.getField(row, headerInfo.columnMap, 'quantity'));
        const manualPrice = this.toNumber(this.getField(row, headerInfo.columnMap, 'manual_price'));

        const asset = {
          id: this.toStringValue(this.getField(row, headerInfo.columnMap, 'asset_id')),
          name,
          type,
          currency,
          valueInput,
          valuationDisplay,
          quantity,
          manualPrice,
          owner: this.toStringValue(this.getField(row, headerInfo.columnMap, 'owner')),
          ticker: this.toStringValue(this.getField(row, headerInfo.columnMap, 'ticker')),
          market: this.toStringValue(this.getField(row, headerInfo.columnMap, 'market')),
          avgCost: this.toNumber(this.getField(row, headerInfo.columnMap, 'avg_cost')),
          bankName: this.toStringValue(this.getField(row, headerInfo.columnMap, 'bank_name')),
          accountNumber: this.toStringValue(this.getField(row, headerInfo.columnMap, 'account_number')),
          interestRatePct: this.toNumber(this.getField(row, headerInfo.columnMap, 'interest_rate_pct')),
          maturityDate: this.toStringValue(this.getField(row, headerInfo.columnMap, 'maturity_date')),
        };

        asset.valuation = this.computeAssetValuation(asset);
        assets.push(asset);
      }

      return assets;
    },

    parseDashboardSheet(workbook) {
      const sheetName = workbook.SheetNames.find((name) => this.normalizeText(name).includes('dashboard'));
      if (!sheetName) return null;

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      });

      if (!rows.length) return null;

      let totalAssets = null;
      let totalLiabilities = null;
      let netWorth = null;
      const breakdown = {};

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] || [];
        const label = this.normalizeText(row[0]);
        if (!label) continue;

        if (label.startsWith('totalassets')) {
          totalAssets = this.toNumber(row[1]);
        } else if (label.startsWith('totalliabilities')) {
          totalLiabilities = this.toNumber(row[1]);
        } else if (label.startsWith('networth')) {
          netWorth = this.toNumber(row[1]);
        }
      }

      const breakdownHeaderIndex = rows.findIndex((row) => {
        const first = this.normalizeText(row && row[0]);
        const second = this.normalizeText(row && row[1]);
        return first === 'assettype' && second.startsWith('valuation');
      });

      if (breakdownHeaderIndex >= 0) {
        for (let i = breakdownHeaderIndex + 1; i < rows.length; i += 1) {
          const row = rows[i] || [];
          const rawType = this.toStringValue(row[0]);
          const value = this.toNumber(row[1]);
          if (!rawType && value === null) break;
          if (!rawType || value === null || value <= 0) continue;
          const type = this.normalizeAssetType(rawType);
          breakdown[type] = (breakdown[type] || 0) + value;
        }
      }

      return {
        totalAssets,
        totalLiabilities,
        netWorth,
        breakdown,
      };
    },

    buildDashboard(assets, dashboardFromSheet) {
      const computed = this.computeDashboardFromAssets(assets);

      const hasComputedTotals =
        computed.totalAssets > 0 || computed.totalLiabilities > 0 || computed.netWorth !== 0 || assets.length > 0;

      const totalAssets = hasComputedTotals
        ? computed.totalAssets
        : Number(dashboardFromSheet && dashboardFromSheet.totalAssets ? dashboardFromSheet.totalAssets : 0);
      const totalLiabilities = hasComputedTotals
        ? computed.totalLiabilities
        : Number(dashboardFromSheet && dashboardFromSheet.totalLiabilities ? dashboardFromSheet.totalLiabilities : 0);
      const netWorth = hasComputedTotals
        ? computed.netWorth
        : Number(dashboardFromSheet && dashboardFromSheet.netWorth ? dashboardFromSheet.netWorth : totalAssets - totalLiabilities);

      const computedBreakdownHasValues = Object.keys(computed.breakdown).length > 0;
      const breakdown = computedBreakdownHasValues
        ? computed.breakdown
        : (dashboardFromSheet && dashboardFromSheet.breakdown) || {};

      return {
        totalAssets,
        totalLiabilities,
        netWorth,
        breakdown,
      };
    },

    computeDashboardFromAssets(assets) {
      let totalAssets = 0;
      let totalLiabilities = 0;
      const breakdown = {};

      for (const asset of assets) {
        const value = Number(asset.valuation || 0);
        if (!Number.isFinite(value)) continue;

        if (value > 0) {
          totalAssets += value;
          const type = asset.type || 'other';
          breakdown[type] = (breakdown[type] || 0) + value;
        } else if (value < 0) {
          totalLiabilities += Math.abs(value);
        }
      }

      return {
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        breakdown,
      };
    },

    computeAssetValuation(asset) {
      const direct = this.toNumber(asset.valuationDisplay);
      if (direct !== null) return direct;

      if (['stock', 'etf', 'crypto'].includes(asset.type)) {
        if (asset.quantity !== null && asset.manualPrice !== null && asset.quantity > 0 && asset.manualPrice > 0) {
          return asset.quantity * asset.manualPrice;
        }
      }

      if (asset.valueInput !== null) {
        if (asset.type === 'liability') {
          return -Math.abs(asset.valueInput);
        }
        return asset.valueInput;
      }

      return 0;
    },

    findAssetsSheet(workbook) {
      const directName = workbook.SheetNames.find((name) => {
        const normalized = this.normalizeText(name);
        return normalized === 'assets' || normalized.includes('자산');
      });
      if (directName) {
        return workbook.Sheets[directName];
      }

      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
          raw: true,
          blankrows: false,
          range: 0,
        });

        if (!rows.length) continue;
        const headerInfo = this.findHeaderRow(rows, { required: ['name', 'type'], maxRows: 12 });
        if (headerInfo) {
          return sheet;
        }
      }

      return null;
    },

    findHeaderRow(rows, options = {}) {
      const { required = [], maxRows = 15 } = options;
      const fieldByAlias = this.buildHeaderAliasMap();

      for (let i = 0; i < Math.min(rows.length, maxRows); i += 1) {
        const row = rows[i] || [];
        const columnMap = {};

        row.forEach((cell, idx) => {
          const alias = this.normalizeText(cell);
          const field = fieldByAlias[alias];
          if (field && columnMap[field] === undefined) {
            columnMap[field] = idx;
          }
        });

        const ok = required.every((field) => columnMap[field] !== undefined);
        if (ok) {
          return {
            headerRow: i,
            columnMap,
          };
        }
      }

      return null;
    },

    buildHeaderAliasMap() {
      const aliases = {
        asset_id: ['assetid', '자산id', 'id'],
        name: ['자산명', 'assetname', 'name'],
        type: ['자산타입', 'assettype', 'type'],
        currency: ['통화', 'currency'],
        value_input: ['원금평가금액', '원금', '평가금액', 'assetvalue', 'value'],
        interest_rate_pct: ['금리연', '금리', 'interestrate', 'interestratepct'],
        maturity_date: ['만기일', 'maturity', 'maturitydate'],
        valuation_display: ['평가금액krw', 'valuationkrw', 'valuationdisplay', 'valuation'],
        owner: ['소유자명의', '소유자', '명의', 'owner'],
        ticker: ['티커', 'ticker'],
        market: ['시장', 'market'],
        quantity: ['수량', 'quantity'],
        manual_price: ['현재가1주당수동', '현재가1주당', '현재가', 'manualprice'],
        avg_cost: ['평균단가', 'avgcost'],
        bank_name: ['은행명', 'bankname'],
        account_number: ['계좌번호', 'accountnumber', 'accountno'],
      };

      const map = {};
      Object.entries(aliases).forEach(([field, list]) => {
        list.forEach((alias) => {
          map[this.normalizeText(alias)] = field;
        });
      });
      return map;
    },

    getField(row, columnMap, field) {
      const idx = columnMap[field];
      if (idx === undefined) return null;
      return row[idx];
    },

    normalizeAssetType(value) {
      const raw = this.toStringValue(value);
      if (!raw) return 'other';
      const canonical = raw.toLowerCase().replace(/\s+/g, ' ');
      if (ASSET_TYPE_ALIASES[canonical]) return ASSET_TYPE_ALIASES[canonical];
      if (ASSET_TYPE_ALIASES[raw]) return ASSET_TYPE_ALIASES[raw];

      const compact = canonical.replace(/\s+/g, '_');
      if (ASSET_TYPE_LABELS[compact]) return compact;
      return compact || 'other';
    },

    getAssetTypeLabel(type) {
      return ASSET_TYPE_LABELS[type] || type || '-';
    },

    isRowEmpty(row) {
      return !row || row.every((cell) => this.toStringValue(cell) === null && this.toNumber(cell) === null);
    },

    normalizeText(value) {
      const str = this.toStringValue(value);
      if (!str) return '';
      return str
        .toLowerCase()
        .replace(/[\s\t\n\r]+/g, '')
        .replace(/[()\[\]{}\-_/.,:%]/g, '');
    },

    toStringValue(value) {
      if (value === null || value === undefined) return null;
      const str = String(value).trim();
      return str ? str : null;
    },

    toNumber(value) {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (value instanceof Date) return null;
      const str = String(value).trim().replace(/,/g, '');
      if (!str) return null;
      const num = Number(str);
      return Number.isFinite(num) ? num : null;
    },

    formatKoreanAmountWords(value) {
      const units = ['', '만', '억', '조', '경'];
      const num = Math.floor(Math.abs(Number(value || 0)));
      if (!num) return '';

      let result = '';
      let current = num;
      let unitIndex = 0;
      while (current > 0 && unitIndex < units.length) {
        const chunk = current % 10000;
        if (chunk) {
          result = `${chunk.toLocaleString('ko-KR')}${units[unitIndex]}${result ? ` ${result}` : ''}`;
        }
        current = Math.floor(current / 10000);
        unitIndex += 1;
      }
      return `${result}원`;
    },

    formatCurrency(value, currency = 'KRW') {
      const num = Number(value || 0);
      if (!Number.isFinite(num)) return `0 ${currency}`;

      const abs = Math.abs(num);
      const formatted =
        abs >= 1000000
          ? new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(num)
          : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(num);

      return `${formatted} ${currency}`;
    },

    formatNumber(value) {
      const num = this.toNumber(value);
      if (num === null) return '-';
      return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(num);
    },

    formatTimestamp(isoString) {
      if (!isoString) return '-';
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('ko-KR');
    },

    normalizeAnalysisAiEndpoint(value) {
      const raw = this.toStringValue(value);
      if (!raw) return DEFAULT_OPENAI_REPORT_ENDPOINT;
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      if (raw.startsWith('/')) return raw;
      return `/${raw}`;
    },

    ensureStringArray(value) {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => this.toStringValue(item))
        .filter((item) => !!item);
    },

    escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
})();
