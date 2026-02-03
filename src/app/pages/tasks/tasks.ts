import { Component, OnInit, OnDestroy, LOCALE_ID, HostListener } from '@angular/core';
import { CommonModule, DatePipe, registerLocaleData } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import localeRu from '@angular/common/locales/ru';

// Регистрируем русскую локализацию
registerLocaleData(localeRu);

const STATUS_LIST = [
  { value: 0, label: 'Все задачи' },
  { value: 1, label: 'Новые' },
  { value: 2, label: 'Ждут выполнения' },
  { value: 3, label: 'В работе' },
  { value: 4, label: 'Предположительно завершены' },
  { value: 5, label: 'Завершены' },
  { value: 6, label: 'Отложены' },
  { value: 7, label: 'Отклонены' },
];

const SORT_LIST = [
  { value: 'ID', label: 'ID' },
  { value: 'TITLE', label: 'Название' },
  { value: 'DEADLINE', label: 'Крайний срок' },
];

const REFRESH_INTERVALS = [
  { value: 0, label: 'Не обновлять' },
  { value: 5, label: 'Каждые 5 минут' },
  { value: 10, label: 'Каждые 10 минут' },
  { value: 15, label: 'Каждые 15 минут' },
  { value: 30, label: 'Каждые 30 минут' },
  { value: 60, label: 'Каждый час' },
];

const GROUP_LIST = [
  { value: 174, label: 'Отдел технологов' },
  { value: 224, label: 'Инструментальный отдел' }, 
  { value: 226, label: 'План работы цеха' }, 
];

const PAGE_SIZE = 50;

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tasks.html',
  styleUrl: './tasks.css',
  providers: [
    { provide: LOCALE_ID, useValue: 'ru' }
  ]
})
export class Tasks implements OnInit, OnDestroy {
  tasks: any[] = [];
  loading = false;
  error = '';
  statusList = STATUS_LIST;
  selectedStatus = 0;
  page = 1;
  total = 0;
  search = '';
  sortField = 'DEADLINE';
  sortDirection: 'asc' | 'desc' = 'asc';
  sortList = SORT_LIST;
  refreshIntervals = REFRESH_INTERVALS;
  selectedRefresh = 5;
  private refreshTimer: any = null;
  // Фильтр по дедлайну (диапазон дат)
  deadlineFrom: string = '';
  deadlineTo: string = '';
  // Фильтр по исполнителю
  responsibleList: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Все исполнители' }
  ];
  selectedResponsible = 0;
  private responsibleIdToName: Record<number, string> = {};
  showScrollDown = false;
  // Фильтр по группе
  groupList = GROUP_LIST;
  selectedGroup = 174; // По умолчанию Отдел технологов

  constructor(private router: Router) {}

  ngOnInit() {
    if (localStorage.getItem('isAuth') !== '1') {
      this.router.navigate(['/login']);
      return;
    }
    this.loadResponsibleFromStorage();
    this.rebuildResponsibleListFromMap();
    // По умолчанию ставим текущую дату в фильтр дедлайна (диапазон за сегодня)
    const todayStr = this.formatDateForInput(new Date());
    this.deadlineFrom = todayStr;
    this.deadlineTo = todayStr;
    this.fetchTasks();
    this.setupAutoRefresh();
    // Первичная оценка видимости кнопки после начальной отрисовки
    setTimeout(() => this.updateScrollButtonVisibility(), 0);
  }

  ngOnDestroy() {
    this.clearAutoRefresh();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  formatDeadline(deadline: string | null): string {
    if (!deadline) return 'Не указан';
    
    const date = new Date(deadline);
    if (isNaN(date.getTime())) return 'Неверный формат';
    
    // Форматируем в русском стиле: 08.08.2025 14:30
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  getStatusLabel(statusValue: number): string {
    const status = this.statusList.find(s => s.value === statusValue);
    return status ? status.label : 'Неизвестный статус';
  }

  getStatusColor(statusValue: number): string {
    switch (statusValue) {
      case 1: return '#4CAF50'; // Новые - зеленый
      case 2: return '#FF9800'; // Ждут выполнения - оранжевый
      case 3: return '#2196F3'; // В работе - синий
      case 4: return '#9C27B0'; // Предположительно завершены - фиолетовый
      case 5: return '#4CAF50'; // Завершены - зеленый
      case 6: return '#FF5722'; // Отложены - красный
      case 7: return '#F44336'; // Отклонены - красный
      default: return '#757575'; // По умолчанию - серый
    }
  }

  // Унифицированное получение значения статуса из разных возможных полей ответа Bitrix24
  getTaskStatusValue(task: any): number {
    if (!task) return 0;
    const raw =
      task.real_status ??
      task.realStatus ??
      task.status ??
      task.STATUS ??
      task.REAL_STATUS;
    if (typeof raw === 'number') return raw;
    const parsed = parseInt(String(raw), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Форматирует Date в строку для input type="date": YYYY-MM-DD
  private formatDateForInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    return `${yyyy}-${MM}-${dd}`;
  }

  private rebuildResponsibleListFromMap() {
    const options = Object.entries(this.responsibleIdToName)
      .map(([id, name]) => ({ value: Number(id), label: name as string }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    this.responsibleList = [{ value: 0, label: 'Все исполнители' }, ...options];
  }

  private persistResponsibleToStorage() {
    try {
      const payload: Record<string, string> = {};
      for (const [id, name] of Object.entries(this.responsibleIdToName)) {
        payload[id] = name as string;
      }
      localStorage.setItem('responsibleMap', JSON.stringify(payload));
    } catch {}
  }

  private loadResponsibleFromStorage() {
    try {
      const raw = localStorage.getItem('responsibleMap');
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, string>;
      this.responsibleIdToName = {} as Record<number, string>;
      for (const [idStr, name] of Object.entries(obj)) {
        const id = parseInt(idStr, 10);
        if (!isNaN(id) && name && typeof name === 'string') {
          this.responsibleIdToName[id] = name;
        }
      }
    } catch {}
  }

  setupAutoRefresh() {
    this.clearAutoRefresh();
    if (this.selectedRefresh > 0) {
      this.refreshTimer = setInterval(() => {
        // Принудительно ставим сортировку и текущую дату
        this.sortField = 'DEADLINE';
        this.sortDirection = 'asc';
        const todayStr = this.formatDateForInput(new Date());
        this.deadlineFrom = todayStr;
        this.deadlineTo = todayStr;
        this.fetchTasks();
      }, this.selectedRefresh * 60 * 1000);
    } else {
      console.log('[Tasks] Auto-refresh is disabled.');
    }
  }

  clearAutoRefresh() {
    if (this.refreshTimer) {
      console.log(`[Tasks] Clearing auto-refresh timer with ID: ${this.refreshTimer}`);
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  onRefreshChange(value: number) {
    this.selectedRefresh = value;
    this.setupAutoRefresh();
  }

  manualRefresh() {
    // Принудительно ставим сортировку и текущую дату
    this.sortField = 'DEADLINE';
    this.sortDirection = 'asc';
    const todayStr = this.formatDateForInput(new Date());
    this.deadlineFrom = todayStr;
    this.deadlineTo = todayStr;
    this.fetchTasks();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.updateScrollButtonVisibility();
  }

  private updateScrollButtonVisibility() {
    try {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const scrollHeight = doc.scrollHeight || 0;
      const clientHeight = doc.clientHeight || window.innerHeight || 0;
      const threshold = 24;
      const isScrollable = scrollHeight > clientHeight + threshold;
      const atBottom = scrollTop + clientHeight >= scrollHeight - threshold;
      this.showScrollDown = isScrollable && !atBottom;
    } catch {
      this.showScrollDown = false;
    }
  }

  scrollDown() {
    window.scrollBy({ top: Math.round(window.innerHeight * 0.85), left: 0, behavior: 'smooth' });
    setTimeout(() => this.updateScrollButtonVisibility(), 350);
  }

  get groupedTasks() {
    const groups: { [key: string]: any[] } = {};
    for (const task of this.filteredTasks()) {
      const name = task.responsible?.name || 'Без исполнителя';
      if (!groups[name]) groups[name] = [];
      groups[name].push(task);
    }
    return groups;
  }

  filteredTasks() {
    if (!this.search.trim()) return this.tasks;
    const q = this.search.trim().toLowerCase();
    return this.tasks.filter(task => (task.title || '').toLowerCase().includes(q));
  }

  onStatusChange(event: any) {
    this.selectedStatus = +event.target.value;
    this.page = 1;
    this.fetchTasks();
  }

  onSortChange(value: any) {
    this.sortField = value;
    this.page = 1;
    this.fetchTasks();
  }

  onSortDirectionChange(value: any) {
    this.sortDirection = value;
    this.page = 1;
    this.fetchTasks();
  }

  onSearchChange(event: any) {
    this.search = event.target.value;
    // Не сбрасываем страницу, поиск по локальному массиву
  }

  onResponsibleChange(value: any) {
    this.selectedResponsible = Number(value);
    this.page = 1;
    this.fetchTasks();
  }

  onGroupChange(value: any) {
    this.selectedGroup = Number(value);
    this.page = 1;
    this.fetchTasks();
  }

  onDeadlineFromChange(event: any) {
    this.deadlineFrom = event.target.value;
    this.page = 1;
    this.fetchTasks();
  }

  onDeadlineToChange(event: any) {
    this.deadlineTo = event.target.value;
    this.page = 1;
    this.fetchTasks();
  }

  clearDeadlineFilter() {
    this.deadlineFrom = '';
    this.deadlineTo = '';
    this.page = 1;
    this.fetchTasks();
  }

  isOverdue(task: any): boolean {
    if (!task.endDatePlan || !task.deadline) return false;
  
    const end = new Date(task.endDatePlan).getTime();
    const deadline = new Date(task.deadline).getTime();
  
    // Для проверки: выведет в консоль true, если план позже дедлайна
    // console.log(`${task.title}: ${end > deadline}`); 
  
    return end > deadline;
  }

  private formatDeadlineForFilter(dateString: string, endOfDay: boolean): string {
    // Вход: YYYY-MM-DD из <input type="date">
    if (!dateString) return '';
    const [yearStr, monthStr, dayStr] = dateString.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const hours = endOfDay ? 23 : 0;
    const minutes = endOfDay ? 59 : 0;
    const seconds = endOfDay ? 59 : 0;

    const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
    const pad = (n: number) => String(n).padStart(2, '0');
    const tzoMinutes = -localDate.getTimezoneOffset();
    const sign = tzoMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(tzoMinutes);
    const tzH = pad(Math.floor(abs / 60));
    const tzM = pad(abs % 60);
    const tz = `${sign}${tzH}:${tzM}`;

    const yyyy = localDate.getFullYear();
    const MM = pad(localDate.getMonth() + 1);
    const dd = pad(localDate.getDate());
    const HH = pad(localDate.getHours());
    const mm = pad(localDate.getMinutes());
    const ss = pad(localDate.getSeconds());

    // Формат: YYYY-MM-DDThh:mm:ss±hh:mm согласно Bitrix24
    return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}${tz}`;
  }

  fetchTasks(forceTodayFilter: boolean = false) {
    if (forceTodayFilter) {
      const todayStr = this.formatDateForInput(new Date());
      this.deadlineFrom = todayStr;
      this.deadlineTo = todayStr;
    }
    this.loading = true;
    this.error = '';
    const start = (this.page - 1) * PAGE_SIZE;

    const baseUrl = 'https://grosver-group.bitrix24.by/rest/196/gh4cf21vcpwrgub8/tasks.task.list';
    const url = new URL(baseUrl);
    const params = new URLSearchParams();
    params.set('filter[GROUP_ID]', String(this.selectedGroup));
    params.set('filter[!RESPONSIBLE_ID]', '196'); // исключаем планировщика задач
    params.set('start', String(start));

    if (this.selectedStatus !== 0) {
      params.set('filter[REAL_STATUS]', String(this.selectedStatus));
    }

    if (this.selectedResponsible !== 0) {
      params.set('filter[RESPONSIBLE_ID]', String(this.selectedResponsible));
    }

    // Фильтр по дедлайну: включительно по дням (начало/конец суток) в ISO 8601 с таймзоной
    let from = this.deadlineFrom;
    let to = this.deadlineTo;
    if (from && to && from > to) {
      [from, to] = [to, from];
    }
   
    // Новый: фильтруем по плановым датам задачи (START_DATE_PLAN / END_DATE_PLAN)
    // Новый: пересечение интервалов: start <= to  AND  end >= from
    if (from) {
      // END_DATE_PLAN >= from  (закончен не раньше, чем from)
      params.set('filter[>=END_DATE_PLAN]', this.formatDeadlineForFilter(from, false));
    }
    if (to) {
      // START_DATE_PLAN <= to  (начат не позже, чем to)
      params.set('filter[<=START_DATE_PLAN]', this.formatDeadlineForFilter(to, true));
    }


    params.set(`order[${this.sortField}]`, this.sortDirection);
    url.search = params.toString();

    // Для отладки можно посмотреть финальный URL в консоли
    try { console.log('[tasks] request:', url.toString()); } catch {}

    fetch(url.toString())
      .then(async response => {
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try {
            const err = await response.json();
            message = err?.error_description || err?.error || message;
          } catch {}
          throw new Error(message);
        }
        return response.json();
      })
      .then(data => {
        this.tasks = data.result?.tasks || [];
        // Bitrix может возвращать total в разных местах; делаем максимально устойчиво
        this.total = data.total || data.result?.total || this.tasks.length;
        // Обновляем список исполнителей (накапливаем уникальные id->name)
        for (const t of this.tasks) {
          const rawId = t?.responsible?.id;
          const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
          const name = t?.responsible?.name;
          if (typeof id === 'number' && id > 0 && typeof name === 'string' && name.trim()) {
            this.responsibleIdToName[id] = name.trim();
          }
        }
        this.persistResponsibleToStorage();
        this.rebuildResponsibleListFromMap();
        // Обновляем видимость кнопки после загрузки задач
        setTimeout(() => this.updateScrollButtonVisibility(), 0);
        this.loading = false;
      })
      .catch(err => {
        this.error = `Ошибка загрузки задач: ${err?.message || err}`;
        this.loading = false;
      });
  }

  nextPage() {
    if (this.page * PAGE_SIZE < this.total) {
      this.page++;
      this.fetchTasks();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.fetchTasks();
    }
  }

  logout() {
    localStorage.removeItem('isAuth');
    this.router.navigate(['/login']);
  }

  goToSearch() {
    this.router.navigate(['/search']);
  }

  goToAnalytics() {
    this.router.navigate(['/analytics']);
  }

  goToResponsibleTasks() {
    this.router.navigate(['/responsible-tasks']);
  }
}
