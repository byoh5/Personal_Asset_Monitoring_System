(() => {
  const STORAGE = {
    theme: 'asset_monitoring-theme',
    lastFile: 'asset_monitoring-web-last-file-meta',
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
    state: {
      assets: [],
      dashboard: null,
      fileMeta: null,
      message: '',
      messageType: 'info',
      filterText: '',
      filterType: 'all',
    },

    menuItems: [
      { id: 'dashboard', icon: '📊', label: '대시보드' },
      { id: 'assets', icon: '💼', label: '자산' },
    ],

    init() {
      ThemeManager.init();
      this.loadFileMeta();
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

    renderLayout() {
      const app = document.getElementById('app');
      app.innerHTML = `
        <div class="app-layout">
          <header class="app-header">
            <h1>Personal Asset Monitoring</h1>
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
        : '아직 파일이 로딩되지 않았습니다.';

      const messageHtml = this.state.message
        ? `<div class="connection-banner ${this.state.messageType === 'error' ? 'connection-banner-error' : 'connection-banner-warning'}" style="margin-top: 12px;"><span class="connection-banner-icon">${this.state.messageType === 'error' ? '⚠️' : 'ℹ️'}</span><div class="connection-banner-text">${this.escapeHtml(this.state.message)}</div></div>`
        : '';

      toolbar.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div class="file-loader-row">
            <div>
              <h3 class="card-title" style="margin:0;">엑셀 기반 조회 데이터</h3>
              <div class="card-subtitle">기존 프로젝트에서 Export한 자산 엑셀 파일을 선택하세요.</div>
              <div class="form-hint" style="margin-top: 8px;">${metaText}</div>
              <div class="form-hint">브라우저 보안 정책상 새로고침 후에는 파일을 다시 선택해야 합니다.</div>
            </div>
            <div class="file-loader-actions">
              <label for="excelFileInput" class="btn btn-primary">엑셀 파일 선택</label>
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

        this.saveFileMeta({
          name: file.name,
          size: file.size,
          loadedAt: new Date().toISOString(),
        });

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
      this.renderDataToolbar();
      this.renderPage(this.currentPage);
    },

    renderPage(page) {
      this.currentPage = page;
      this.updateMenuActiveState();
      if (page !== 'dashboard') {
        this.destroyBreakdownChart();
      }

      const content = document.getElementById('page-content');
      if (!content) return;

      if (page === 'dashboard') {
        this.renderDashboardPage(content);
      } else if (page === 'assets') {
        this.renderAssetsPage(content);
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
      if (!this.state.assets.length) {
        container.innerHTML = this.renderEmptyState('자산 목록을 보려면 엑셀 파일을 먼저 선택하세요.');
        return;
      }

      const typeOptions = this.getTypeOptions();
      const filtered = this.getFilteredAssets();
      const total = filtered.reduce((sum, asset) => sum + (asset.valuation || 0), 0);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">자산</h1>
          <p class="page-subtitle">엑셀에 저장된 자산 정보를 조회합니다.</p>
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
            <strong>${this.formatCurrency(total)}</strong>
          </div>

          ${filtered.length ? this.renderAssetsTable(filtered) : this.renderEmptyState('조건에 맞는 자산이 없습니다.', true)}
        </div>
      `;

      this.bindAssetFilterEvents();
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
              </tr>
            </thead>
            <tbody>
              ${assets
                .map(
                  (asset) => `
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
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
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
