import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

interface Task {
  id: string;
  title?: string; // Make title optional, as it might be missing or under a different key
  TITLE?: string; // Add TITLE as a possible field
  status: string;
  durationPlan: string;
}

interface TasksResponse {
  result: {
    tasks: Task[];
  };
  total: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css'
})
export class AnalyticsComponent implements OnInit {
  totalHoursAllTasks: number = 0;
  totalHoursMilling: number = 0;
  totalHoursTurning: number = 0;
  totalHoursOtherTasks: number = 0; // New property for other tasks

  totalDaysAllTasks: number = 0;
  remainingHoursAllTasks: number = 0;
  totalDaysMilling: number = 0;
  remainingHoursMilling: number = 0;
  totalDaysTurning: number = 0;
  remainingHoursTurning: number = 0;
  totalDaysOtherTasks: number = 0;
  remainingHoursOtherTasks: number = 0;

  loading: boolean = true;
  error: string | null = null;

  private readonly BASE_URL = 'https://grosver-group.bitrix24.by/rest/196/gh4cf21vcpwrgub8/tasks.task.list';
  private readonly GROUP_ID = '174';
  private readonly PAGE_SIZE = 50; // Assuming a reasonable page size for pagination

  constructor(private http: HttpClient, private router: Router) { }

  ngOnInit(): void {
    this.loadAllTasks();
  }

  goBack(): void {
    this.router.navigate(['/tasks']);
  }

  private calculateDisplayValues(): void {
    const hoursPerDayFactor = 3; // x * 3
    const totalHoursInDay = 24; // divide by 24 hours

    const calculateTime = (hours: number) => {
      const totalAdjustedHours = hours * hoursPerDayFactor;
      const days = Math.floor(totalAdjustedHours / totalHoursInDay);
      const remainingHours = totalAdjustedHours % totalHoursInDay;
      return { days, remainingHours };
    };

    const allTasksTime = calculateTime(this.totalHoursAllTasks);
    this.totalDaysAllTasks = allTasksTime.days;
    this.remainingHoursAllTasks = allTasksTime.remainingHours;

    const millingTime = calculateTime(this.totalHoursMilling);
    this.totalDaysMilling = millingTime.days;
    this.remainingHoursMilling = millingTime.remainingHours;

    const turningTime = calculateTime(this.totalHoursTurning);
    this.totalDaysTurning = turningTime.days;
    this.remainingHoursTurning = turningTime.remainingHours;

    const otherTasksTime = calculateTime(this.totalHoursOtherTasks - this.totalHoursMilling - this.totalHoursTurning);
    this.totalDaysOtherTasks = otherTasksTime.days;
    this.remainingHoursOtherTasks = otherTasksTime.remainingHours;
  }

  private async fetchFilteredTasks(titleFilter: string | null = null): Promise<Task[]> {
    let filteredTasks: Task[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = new URL(this.BASE_URL);
        const params = new URLSearchParams();
        params.set('filter[GROUP_ID]', this.GROUP_ID);
        params.set('start', String(page * this.PAGE_SIZE));
        params.set('select[]', 'ID');
        params.set('select[]', 'TITLE');
        params.set('select[]', 'STATUS');
        params.set('select[]', 'DURATION_PLAN');
        params.set('filter[REAL_STATUS][0]', '2');
        params.set('filter[REAL_STATUS][1]', '3');

        if (titleFilter) {
          params.set('filter[TITLE]', titleFilter);
        }

        url.search = params.toString();
        console.log(`fetchFilteredTasks: Fetching page ${page} with filter '${titleFilter || 'none'}' from ${url.toString()}`);

        const response = await this.http.get<TasksResponse>(url.toString()).toPromise();
        console.log(`fetchFilteredTasks: Received response for page ${page} with filter '${titleFilter || 'none'}':`, response);

        if (response && response.result && response.result.tasks) {
          filteredTasks = filteredTasks.concat(response.result.tasks);
          if (response.total && filteredTasks.length >= response.total) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          console.warn(`fetchFilteredTasks: Unexpected response or no tasks for page ${page} with filter '${titleFilter || 'none'}'`, response);
          hasMore = false;
        }
      } catch (err) {
        console.error(`fetchFilteredTasks: Error fetching tasks with filter '${titleFilter || 'none'}':`, err);
        this.error = `Failed to load tasks with filter '${titleFilter || 'none'}': ${err instanceof Error ? err.message : String(err)}`;
        hasMore = false;
      }
    }
    return filteredTasks;
  }

  async loadAllTasks(): Promise<void> {
    console.log('loadAllTasks: Starting...');
    this.loading = true;
    this.error = null;

    try {
      const allTasksPromise = this.fetchFilteredTasks(); // Fetch all tasks (no title filter)
      const millingTasksPromise = this.fetchFilteredTasks('фр.'); // Fetch tasks with 'фр.'
      const turningTasksPromise = this.fetchFilteredTasks('ток.'); // Fetch tasks with 'ток.'

      const [allTasks, millingTasks, turningTasks] = await Promise.all([
        allTasksPromise,
        millingTasksPromise,
        turningTasksPromise
      ]);

      console.log('loadAllTasks: All task lists fetched. Processing...');
      this.processTasks(allTasks, millingTasks, turningTasks);
    } catch (err) {
      console.error('loadAllTasks: Error in main task loading:', err);
      this.error = `Failed to load all tasks: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.loading = false;
      console.log('loadAllTasks: Finished.');
    }
  }

  processTasks(allTasks: Task[], millingTasks: Task[], turningTasks: Task[]): void {
    let totalAll = 0;
    let totalMilling = 0;
    let totalTurning = 0;
    let totalOther = 0; // Initialize for other tasks

    console.log('processTasks: Starting with task lists:', { allTasks, millingTasks, turningTasks });

    for (const task of allTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalAll += duration;

      const taskTitle = task.title || task.TITLE || ''; // Ensure taskTitle is always a string
      const lowerCaseTitle = taskTitle.toLowerCase();

      if (!lowerCaseTitle.includes('фр.') && !lowerCaseTitle.includes('ток.')) {
        totalOther += duration;
      }
    }

    for (const task of millingTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalMilling += duration;
    }

    for (const task of turningTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalTurning += duration;
    }

    this.totalHoursAllTasks = totalAll;
    this.totalHoursMilling = totalMilling;
    this.totalHoursTurning = totalTurning;
    this.totalHoursOtherTasks = totalOther; // Assign calculated other tasks total
    this.calculateDisplayValues(); // Calculate and display days/hours after initial load
    console.log('processTasks: Calculated totals:', {
      totalHoursAllTasks: this.totalHoursAllTasks,
      totalHoursMilling: this.totalHoursMilling,
      totalHoursTurning: this.totalHoursTurning,
      totalHoursOtherTasks: this.totalHoursOtherTasks,
    });
  }
}
