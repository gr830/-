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
  groupId: number = 174; // По умолчанию, как в примере
  responsibleId: number = 0; // По умолчанию без фильтра по исполнителю
  selectedStatus: number = 0; // По умолчанию все статусы
  deadlineFrom: string = '';
  deadlineTo: string = '';
  statusList = STATUS_LIST;

  // Параметры пагинации
  page: number = 1;
  pageSize: number = PAGE_SIZE;
  total: number = 0;

  constructor(private router: Router) { }

  ngOnInit(): void {
    // Инициализация дедлайна сегодняшней датой для удобства
    const todayStr = this.formatDateForInput(new Date());
    this.deadlineFrom = todayStr;
    this.deadlineTo = todayStr;
    this.searchTasks(); // Выполняем первый поиск при загрузке страницы
  }

  searchTasks() {
    this.loading = true;
    this.error = '';

    const baseUrl = 'https://grosver-group.bitrix24.by/rest/196/gh4cf21vcpwrgub8/tasks.task.list';
    const url = new URL(baseUrl);
    const params = new URLSearchParams();

    // Параметры фильтрации
    if (this.searchTitle) {
      params.set('filter[TITLE]', this.searchTitle);
    }
    if (this.groupId) {
      params.set('filter[GROUP_ID]', String(this.groupId));
    }
    if (this.responsibleId) {
      params.set('filter[RESPONSIBLE_ID]', String(this.responsibleId));
    }
    if (this.selectedStatus !== 0) {
      params.set('filter[REAL_STATUS]', String(this.selectedStatus));
    }

    // Фильтр по дедлайну
    let from = this.deadlineFrom;
    let to = this.deadlineTo;
    if (from && to && from > to) {
      [from, to] = [to, from]; // Корректируем, если даты введены в неверном порядке
    }
    if (from) {
      params.set('filter[>=DEADLINE]', this.formatDeadlineForFilter(from, false));
    }
    if (to) {
      params.set('filter[<=DEADLINE]', this.formatDeadlineForFilter(to, true));
    }

    // Параметры выбора полей и сортировки (из примера запроса)
    params.set('select[0]', 'ID');
    params.set('select[1]', 'TITLE');
    params.set('select[2]', 'STATUS');
    params.set('select[3]', 'RESPONSIBLE_ID');
    params.set('select[4]', 'DEADLINE');
    params.set('select[5]', 'DURATION_PLAN');
    params.set('order[ID]', 'asc');

    // Параметры пагинации
    params.set('start', String((this.page - 1) * this.pageSize));

    url.search = params.toString();

    try { console.log('[search] request:', url.toString()); } catch {}

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
        this.total = data.total || data.result?.total || this.tasks.length; // Используем data.total для общего количества
        this.loading = false;
      })
      .catch(err => {
        this.error = `Ошибка поиска задач: ${err?.message || err}`;
        this.loading = false;
      });
  }

  clearDeadlineFilter() {
    this.deadlineFrom = '';
    this.deadlineTo = '';
    this.page = 1;
    this.searchTasks();
  }

  nextPage() {
    if (this.page * this.pageSize < this.total) {
      this.page++;
      this.searchTasks();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.searchTasks();
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
