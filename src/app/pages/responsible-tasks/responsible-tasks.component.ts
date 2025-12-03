import { Component, OnInit, LOCALE_ID } from '@angular/core';
import { CommonModule, NgIf, NgForOf, registerLocaleData } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import localeRu from '@angular/common/locales/ru';

registerLocaleData(localeRu);

const STATUS_LIST_FILTER = [
  { value: 2, label: 'Ждут выполнения' },
  { value: 3, label: 'В работе' },
];

const ALL_STATUS_LIST = [
  { value: 0, label: 'Все задачи' },
  { value: 1, label: 'Новые' },
  { value: 2, label: 'Ждут выполнения' },
  { value: 3, label: 'В работе' },
  { value: 4, label: 'Предположительно завершены' },
  { value: 5, label: 'Завершены' },
  { value: 6, label: 'Отложены' },
  { value: 7, label: 'Отклонены' },
];

const BASE_URL = 'https://grosver-group.bitrix24.by/rest/196/gh4cf21vcpwrgub8';
const GROUP_ID = 174; // 'Отдел технологов'
const PAGE_SIZE = 50;

@Component({
  selector: 'app-responsible-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIf, NgForOf],
  templateUrl: './responsible-tasks.component.html',
  styleUrl: './responsible-tasks.component.css',
  providers: [
    { provide: LOCALE_ID, useValue: 'ru' }
  ]
})
export class ResponsibleTasksComponent implements OnInit {
  loading = false;
  error = '';
  tasks: any[] = [];
  allFetchedTasks: any[] = [];
  responsibleList: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Выберите исполнителя' }
  ];
  selectedResponsible = 0;
  public responsibleIdToName: Record<number, string> = {};
  selectedResponsibleIcon: string | null = null;
  showTasksList = false;

  constructor(private router: Router) {}

  ngOnInit() {
    if (localStorage.getItem('isAuth') !== '1') {
      this.router.navigate(['/login']);
      return;
    }
    this.loadResponsibleFromStorage();
    this.rebuildResponsibleListFromMap();
  }

  goBack() {
    this.router.navigate(['/tasks']);
  }

  onResponsibleChange(value: any) {
    this.selectedResponsible = Number(value);
    this.tasks = [];
    this.showTasksList = false;
    this.selectedResponsibleIcon = null; // Сброс аватара при смене исполнителя
  }

  async generateResponsibleTasks() {
    if (this.selectedResponsible === 0) {
      this.error = 'Пожалуйста, выберите исполнителя.';
      this.tasks = [];
      this.showTasksList = false;
      return;
    }

    this.loading = true;
    this.error = '';
    this.allFetchedTasks = [];
    this.tasks = [];
    this.showTasksList = false;

    let start = 0;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${BASE_URL}/tasks.task.list`);
      const params = new URLSearchParams();
      params.set('filter[GROUP_ID]', String(GROUP_ID));
      params.set('filter[RESPONSIBLE_ID]', String(this.selectedResponsible));
      params.set('filter[REAL_STATUS][]', String(STATUS_LIST_FILTER[0].value)); // Ждут выполнения
      params.append('filter[REAL_STATUS][]', String(STATUS_LIST_FILTER[1].value)); // В работе
      params.set('order[END_DATE_PLAN]', 'asc');
      params.set('order[DEADLINE]', 'asc'); // Fallback sorting
      params.set('select[]', 'ID');
      params.append('select[]', 'TITLE');
      params.append('select[]', 'STATUS');
      params.append('select[]', 'DEADLINE');
      params.append('select[]', 'START_DATE_PLAN');
      params.append('select[]', 'END_DATE_PLAN');
      params.append('select[]', 'RESPONSIBLE_ID');
      params.append('select[]', 'REAL_STATUS');
      params.append('select[]', 'GROUP_ID');
      params.append('select[]', 'responsible.icon'); // Fetch responsible icon
      params.append('select[]', 'DURATION_PLAN'); // Fetch duration plan
      params.set('start', String(start));
      url.search = params.toString();

      try {
        console.log('[ResponsibleTasksComponent] request:', url.toString());
        const response = await fetch(url.toString());
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try {
            const err = await response.json();
            message = err?.error_description || err?.error || message;
          } catch {}
          throw new Error(message);
        }
        const data = await response.json();

        const fetchedTasks = data.result?.tasks || [];
        this.allFetchedTasks.push(...fetchedTasks);
        
        // Capture responsible icon from the first task if available
        if (this.selectedResponsibleIcon === null && fetchedTasks.length > 0) {
          this.selectedResponsibleIcon = fetchedTasks[0]?.responsible?.icon || null;
        }

        if (data.next) {
          start = data.next;
        } else {
          hasMore = false;
        }
      } catch (err) {
        this.error = `Ошибка загрузки задач: ${err instanceof Error ? err.message : String(err)}`;
        this.loading = false;
        this.allFetchedTasks = [];
        return;
      }
    }

    this.allFetchedTasks = this.sortTasksCustom(this.allFetchedTasks);
    this.tasks = this.allFetchedTasks; // Display all fetched and sorted tasks
    this.populateResponsibleList(this.allFetchedTasks); // Update responsible list with all fetched tasks
    this.loading = false;
    this.showTasksList = true;

    if (this.tasks.length === 0) {
      this.error = 'Задачи для выбранного исполнителя не найдены.';
    }
  }

  private sortTasksCustom(tasks: any[]): any[] {
    return [...tasks].sort((a, b) => {
      const dateA = a.endDatePlan ? new Date(a.endDatePlan) : (a.deadline ? new Date(a.deadline) : null);
      const dateB = b.endDatePlan ? new Date(b.endDatePlan) : (b.deadline ? new Date(b.deadline) : null);

      if (dateA && dateB) {
        return dateA.getTime() - dateB.getTime();
      } else if (dateA) {
        return -1; // A has date, B doesn't, so A comes first
      } else if (dateB) {
        return 1;  // B has date, A doesn't, so B comes first
      } else {
        return 0;  // Neither has a date, maintain relative order
      }
    });
  }

  formatDeadline(dateString: string | undefined | null): string {
    if (!dateString) return 'Не указан';
    const date = new Date(dateString);
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

  getResponsibleName(id: number): string {
    return this.responsibleIdToName[id] || 'Неизвестный исполнитель';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  private populateResponsibleList(tasks: any[]) {
    for (const t of tasks) {
      const rawId = t?.responsibleId;
      const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
      const name = t?.responsible?.name;
      if (typeof id === 'number' && id > 0 && typeof name === 'string' && name.trim()) {
        this.responsibleIdToName[id] = name.trim();
      }
    }
    this.persistResponsibleToStorage();
    this.rebuildResponsibleListFromMap();
  }

  private rebuildResponsibleListFromMap() {
    const options = Object.entries(this.responsibleIdToName)
      .map(([id, name]) => ({ value: Number(id), label: name as string }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    this.responsibleList = [{ value: 0, label: 'Выберите исполнителя' }, ...options];
  }

  private persistResponsibleToStorage() {
    try {
      const payload: Record<string, string> = {};
      for (const [id, name] of Object.entries(this.responsibleIdToName)) {
        payload[id] = name as string;
      }
      localStorage.setItem('responsibleMap', JSON.stringify(payload));
    } catch (e) {
      console.error('Error persisting responsible map to local storage:', e);
    }
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
    } catch (e) {
      console.error('Error loading responsible map from local storage:', e);
    }
  }

   getStatusLabel(statusValue: number): string {
    const status = ALL_STATUS_LIST.find(s => s.value === statusValue);
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
    const raw = task.real_status ?? task.realStatus ?? task.status ?? task.STATUS ?? task.REAL_STATUS;
    if (typeof raw === 'number') return raw;
    const parsed = parseInt(String(raw), 10);
    return isNaN(parsed) ? 0 : parsed;
  }
}
