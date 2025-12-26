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
  tasks: any[] = []; // For single responsible tasks
  allFetchedTasks: any[] = [];
  responsibleList: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Все исполнители' } // Changed to show "All executors" as the first option
  ];
  selectedResponsible = -1; // -1 means nothing selected, 0 means all executors
  public responsibleIdToName: Record<number, string> = {};
  selectedResponsibleIcon: string | null = null;
  showTasksList = false;
  lastTaskDueDate: string | null = null;
  totalTasksDuration: number = 0;
  totalWorkingDays: string = '0';

  // Property to hold tasks grouped by responsible (for all executors view)
  allTasksByResponsible: Array<{
    responsibleId: number;
    tasks: any[];
    lastTaskDueDate: string | null;
    totalTasksDuration: number;
    totalWorkingDays: string;
    icon: string | null;
  }> = [];

  showExecutorSelection = false; // Flag to show/hide executor selection panel
  selectedExecutors: number[] = []; // List of selected executors for "All executors" view

  constructor(private router: Router) {}

  ngOnInit() {
    if (localStorage.getItem('isAuth') !== '1') {
      this.router.navigate(['/login']);
      return;
    }
    this.loadResponsibleFromStorage();
    this.rebuildResponsibleListFromMap();
    this.loadSelectedExecutorsFromStorage();
  }

  goBack() {
    this.router.navigate(['/tasks']);
  }

  onResponsibleChange(value: any) {
    this.selectedResponsible = Number(value);
    this.tasks = [];
    this.allTasksByResponsible = [];
    this.showTasksList = false;
    this.selectedResponsibleIcon = null; // Сброс аватара при смене исполнителя
  }

  async generateResponsibleTasks() {
    if (this.selectedResponsible === -1) {
      this.error = 'Пожалуйста, выберите исполнителя или "Все исполнители".';
      this.showTasksList = false;
      return;
    }

    this.loading = true;
    this.error = '';
    this.allFetchedTasks = [];
    this.tasks = [];
    this.allTasksByResponsible = [];
    this.showTasksList = false;

    let start = 0;
    let hasMore = true;

    // Determine if we're fetching for a specific responsible or all responsibles
    const fetchForAllResponsibles = this.selectedResponsible === 0;

    while (hasMore) {
      const url = new URL(`${BASE_URL}/tasks.task.list`);
      const params = new URLSearchParams();
      params.set('filter[GROUP_ID]', String(GROUP_ID));

      // Only add responsible filter if we're not fetching for all responsibles
      if (!fetchForAllResponsibles) {
        params.set('filter[RESPONSIBLE_ID]', String(this.selectedResponsible));
      }

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

        // Capture responsible icon from the first task if available (for single responsible view)
        if (!fetchForAllResponsibles && this.selectedResponsibleIcon === null && fetchedTasks.length > 0) {
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

    if (fetchForAllResponsibles) {
      // Group tasks by responsible for the "All responsibles" view
      this.groupTasksByResponsible();
    } else {
      // Process tasks for single responsible
      this.allFetchedTasks = this.sortTasksCustom(this.allFetchedTasks);
      this.tasks = this.allFetchedTasks; // Display all fetched and sorted tasks
      this.tasks = this.tasks.filter(task => task.endDatePlan);
      this.populateResponsibleList(this.allFetchedTasks); // Update responsible list with all fetched tasks

      if (this.tasks.length === 0) {
        this.error = 'Задачи для выбранного исполнителя не найдены.';
        this.lastTaskDueDate = null;
        this.totalTasksDuration = 0;
        this.totalWorkingDays = '0';
      } else {
        // Calculate last task due date
        const lastTask = this.tasks[this.tasks.length - 1];
        if (lastTask && (lastTask.endDatePlan || lastTask.deadline)) {
          this.lastTaskDueDate = this.formatDeadline(lastTask.endDatePlan || lastTask.deadline);
        } else {
          this.lastTaskDueDate = null;
        }

        // Calculate total tasks duration
        this.totalTasksDuration = this.tasks.reduce((sum, task) => {
          const duration = task.durationPlan ? parseFloat(task.durationPlan) : 0;
          return sum + duration;
        }, 0);

        // Calculate total working days (divide by 8)
        this.totalWorkingDays = (this.totalTasksDuration / 8).toFixed(2);
      }
    }

    this.loading = false;
    this.showTasksList = true;

    if (this.allFetchedTasks.length === 0) {
      if (fetchForAllResponsibles) {
        this.error = 'Задачи для исполнителей не найдены.';
      } else {
        this.error = 'Задачи для выбранного исполнителя не найдены.';
      }
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

  private groupTasksByResponsible() {
    // Group tasks by responsible ID
    const groupedTasks: Record<number, any[]> = {};
    const responsibleIcons: Record<number, string | null> = {};

    for (const task of this.allFetchedTasks) {
      const rawId = task?.responsibleId || task?.RESPONSIBLE_ID;
      const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

      if (typeof id === 'number' && id > 0) {
        // Only include tasks for selected executors (if we're in "All executors" mode)
        if (this.selectedResponsible === 0 && this.selectedExecutors.length > 0 && !this.selectedExecutors.includes(id)) {
          continue; // Skip tasks for unselected executors
        }

        if (!groupedTasks[id]) {
          groupedTasks[id] = [];
        }
        groupedTasks[id].push(task);

        // Store the icon for this responsible if available
        if (task?.responsible?.icon) {
          responsibleIcons[id] = task.responsible.icon;
        }
      }

      // Update responsible name mapping
      const name = task?.responsible?.name;
      if (typeof id === 'number' && id > 0 && typeof name === 'string' && name.trim()) {
        this.responsibleIdToName[id] = name.trim();
      }
    }

    // Convert grouped tasks to the required format with summaries
    this.allTasksByResponsible = Object.entries(groupedTasks).map(([responsibleIdStr, tasks]) => {
      const responsibleId = Number(responsibleIdStr);

      // Filter tasks that have endDatePlan
      const filteredTasks = tasks.filter(task => task.endDatePlan);

      // Sort tasks by endDatePlan
      const sortedTasks = this.sortTasksCustom(filteredTasks);

      // Calculate summary for this responsible
      let lastTaskDueDate: string | null = null;
      if (sortedTasks.length > 0) {
        const lastTask = sortedTasks[sortedTasks.length - 1];
        if (lastTask && (lastTask.endDatePlan || lastTask.deadline)) {
          lastTaskDueDate = this.formatDeadline(lastTask.endDatePlan || lastTask.deadline);
        }
      }

      // Calculate total tasks duration
      const totalTasksDuration = sortedTasks.reduce((sum, task) => {
        const duration = task.durationPlan ? parseFloat(task.durationPlan) : 0;
        return sum + duration;
      }, 0);

      // Calculate total working days (divide by 8)
      const totalWorkingDays = (totalTasksDuration / 8).toFixed(2);

      return {
        responsibleId,
        tasks: sortedTasks,
        lastTaskDueDate,
        totalTasksDuration,
        totalWorkingDays,
        icon: responsibleIcons[responsibleId] || null
      };
    });

    // Sort the responsibles alphabetically by name
    this.allTasksByResponsible.sort((a, b) =>
      this.getResponsibleName(a.responsibleId).localeCompare(this.getResponsibleName(b.responsibleId), 'ru')
    );

    this.persistResponsibleToStorage();
    this.rebuildResponsibleListFromMap();
  }

  // Method to get responsible entries for the template
  getResponsibleEntries() {
    return this.allTasksByResponsible;
  }

  // Method to get responsible icon
  getResponsibleIcon(responsibleId: number): string | null {
    const responsibleEntry = this.allTasksByResponsible.find(entry => entry.responsibleId === responsibleId);
    return responsibleEntry ? responsibleEntry.icon : null;
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

  // Load selected executors from local storage
  private loadSelectedExecutorsFromStorage() {
    try {
      const stored = localStorage.getItem('selectedExecutors');
      if (stored) {
        this.selectedExecutors = JSON.parse(stored).map(Number);
      } else {
        // Initialize with an empty array; will be populated when responsibles are loaded
        this.selectedExecutors = [];
      }
    } catch (e) {
      console.error('Error loading selected executors from storage:', e);
      this.selectedExecutors = [];
    }
  }

  // Save selected executors to local storage
  private saveSelectedExecutorsToStorage() {
    try {
      localStorage.setItem('selectedExecutors', JSON.stringify(this.selectedExecutors));
    } catch (e) {
      console.error('Error saving selected executors to storage:', e);
    }
  }

  // Check if an executor is selected
  isExecutorSelected(executorId: number): boolean {
    return this.selectedExecutors.includes(executorId);
  }

  // Toggle executor selection
  toggleExecutorSelection(executorId: number, event: any) {
    const isChecked = event.target.checked;
    if (isChecked) {
      if (!this.selectedExecutors.includes(executorId)) {
        this.selectedExecutors.push(executorId);
      }
    } else {
      this.selectedExecutors = this.selectedExecutors.filter(id => id !== executorId);
    }
    this.saveSelectedExecutorsToStorage();
  }
}
