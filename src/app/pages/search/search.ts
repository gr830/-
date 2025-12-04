import { Component, OnInit, LOCALE_ID } from '@angular/core';
import { CommonModule, DatePipe, registerLocaleData } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import localeRu from '@angular/common/locales/ru';
registerLocaleData(localeRu);

const STATUS_LIST = [
  { value: 0, label: 'Все статусы' }, // Добавляем опцию для всех статусов
  { value: 1, label: 'Новые' },
  { value: 2, label: 'Ждут выполнения' },
  { value: 3, label: 'В работе' },
  { value: 4, label: 'Предположительно завершены' },
  { value: 5, label: 'Завершены' },
  { value: 6, label: 'Отложены' },
  { value: 7, label: 'Отклонены' },
];

const PAGE_SIZE = 50; // Размер страницы для пагинации

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.html',
  styleUrl: './search.css',
  providers: [
    { provide: LOCALE_ID, useValue: 'ru' }
  ]
})
export class SearchComponent implements OnInit {
  tasks: any[] = [];
  loading = false;
  error = '';

  // Параметры поиска
  searchTitle: string = '';
  groupId!: number ; // По умолчанию, как в примере
  responsibleId: number = 0; // По умолчанию без фильтра по исполнителю
  selectedStatus: number = 0; // По умолчанию все статусы
  deadlineFrom: string = '';
  deadlineTo: string = '';
  statusList = STATUS_LIST;

  // Параметры пагинации
  page: number = 1;
  pageSize: number = PAGE_SIZE;
  total: number = 0;

  totalCalculatedHours: number = 0; // New property for total calculated hours
  totalCalculatedDays: number = 0; // New property for total calculated days

  allFetchedTasks: any[] = []; // New property to store all fetched tasks

  constructor(private router: Router) { }

  ngOnInit(): void {
    // // Инициализация дедлайна сегодняшней датой для удобства
    // const todayStr = this.formatDateForInput(new Date());
    // this.deadlineFrom = todayStr;
    // this.deadlineTo = todayStr;
    // this.searchTasks(); // Выполняем первый поиск при загрузке страницы
  }

  async searchTasks() {
    this.loading = true;
    this.error = '';
    this.allFetchedTasks = []; // Clear previous results
    this.total = 0;

    let currentPage = 0; // Start with the first page
    let hasMore = true;

    const baseUrl = 'https://grosver-group.bitrix24.by/rest/196/gh4cf21vcpwrgub8/tasks.task.list';
    const baseParams = new URLSearchParams();

    // Параметры фильтрации
    if (this.searchTitle) {
      baseParams.set('filter[TITLE]', this.searchTitle);
    }
    if (this.groupId) {
      baseParams.set('filter[GROUP_ID]', String(this.groupId));
    }
    if (this.responsibleId) {
      baseParams.set('filter[RESPONSIBLE_ID]', String(this.responsibleId));
    }
    if (this.selectedStatus !== 0) {
      baseParams.set('filter[REAL_STATUS]', String(this.selectedStatus));
    }

    // Фильтр по дедлайну
    let from = this.deadlineFrom;
    let to = this.deadlineTo;
    if (from && to && from > to) {
      [from, to] = [to, from]; // Корректируем, если даты введены в неверном порядке
    }
    if (from) {
      baseParams.set('filter[>=DEADLINE]', this.formatDeadlineForFilter(from, false));
    }
    if (to) {
      baseParams.set('filter[<=DEADLINE]', this.formatDeadlineForFilter(to, true));
    }

    // Параметры выбора полей и сортировки (из примера запроса)
    baseParams.set('select[0]', 'ID');
    baseParams.set('select[1]', 'TITLE');
    baseParams.set('select[2]', 'STATUS');
    baseParams.set('select[3]', 'RESPONSIBLE_ID');
    baseParams.set('select[4]', 'DEADLINE');
    baseParams.set('select[5]', 'DURATION_PLAN');
    baseParams.set('order[ID]', 'asc');

    while (hasMore) {
      const url = new URL(baseUrl);
      const params = new URLSearchParams(baseParams);
      params.set('start', String(currentPage * this.pageSize));
      url.search = params.toString();

      try {
        const response = await fetch(url.toString());
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try {
            const err = await response.json();
            message = err?.error_description || err?.error || message;
          } catch { }
          throw new Error(message);
        }
        const data = await response.json();

        const fetchedTasks = data.result?.tasks || [];
        this.allFetchedTasks = this.allFetchedTasks.concat(fetchedTasks); // Accumulate all tasks
        this.total = data.total || data.result?.total || this.allFetchedTasks.length;

        if (fetchedTasks.length < this.pageSize || this.allFetchedTasks.length >= this.total) {
          hasMore = false;
        } else {
          currentPage++;
        }

      } catch (err) {
        this.error = `Ошибка поиска задач: ${err instanceof Error ? err.message : String(err)}`;
        this.loading = false;
        return; // Stop further fetching on error
      }
    }

    this.loading = false;
    this.updateDisplayedTasks(); // Update displayed tasks after all are fetched
    this.calculateTotalTime(); // Calculate total time after all tasks are loaded
  }

  private updateDisplayedTasks(): void {
    const startIndex = (this.page - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.tasks = this.allFetchedTasks.slice(startIndex, endIndex);
  }

  clearDeadlineFilter() {
    this.deadlineFrom = '';
    this.deadlineTo = '';
    this.page = 1;
    this.searchTasks();
  }

  calculateTotalTime(): void {
    let totalHours = 0;
    for (const task of this.allFetchedTasks) { // Iterate over allFetchedTasks
      const duration = parseFloat(task.durationPlan || '0');
      if (!isNaN(duration)) {
        totalHours += duration;
      }
    }
    this.totalCalculatedHours = totalHours;
    this.totalCalculatedDays = totalHours / 8; // Assuming 8 working hours per day
  }

  nextPage() {
    if (this.page * this.pageSize < this.total) {
      this.page++;
      this.updateDisplayedTasks(); // Update displayed tasks from allFetchedTasks
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.updateDisplayedTasks(); // Update displayed tasks from allFetchedTasks
    }
  }

  formatDeadline(deadline: string | null): string {
    if (!deadline) return 'Не указан';

    const date = new Date(deadline);
    if (isNaN(date.getTime())) return 'Неверный формат';

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

  private formatDateForInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    return `${yyyy}-${MM}-${dd}`;
  }

  private formatDeadlineForFilter(dateString: string, endOfDay: boolean): string {
    if (!dateString) return '';
    const [yearStr, monthStr, dayStr] = dateString.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Validate parsed date components
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      console.warn(`formatDeadlineForFilter: Invalid date string components: ${dateString}`);
      return ''; // Return empty string for invalid dates
    }

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

    return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}${tz}`;
  }

  goBackToTasks() {
    this.router.navigate(['/tasks']);
  }
}

