import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import { CeilPipe } from '../../pipe/seil';

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
  imports: [CommonModule, FormsModule, CeilPipe],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css'
})
export class AnalyticsComponent implements OnInit {
  totalHoursAllTasks: number = 0;
  totalHoursMilling: number = 0;
  totalHoursTurning: number = 0;
  totalHoursOtherTasks: number = 0; // New property for other tasks
  totalHoursDevelopers: number = 0; // Corrected property name from totalHoursDevelopment

  numberOfMillingTechnologists: number = 0; // Default to 0
  numberOfTurningTechnologists: number = 0; // Default to 0
  numberOfConstructors: number = 0; // New property for constructors

  totalDaysAllTasks: number = 0;
  remainingHoursAllTasks: number = 0;

  totalDaysMilling: number = 0;
  remainingHoursMilling: number = 0;

  totalDaysTurning: number = 0;
  remainingHoursTurning: number = 0;

  totalDaysOtherTasks: number = 0;
  remainingHoursOtherTasks: number = 0;

  totalDaysDevelopers: number = 0;
  remainingHoursDevelopers: number = 0;

  displayedHoursAllTasks: number = 0;
  displayedHoursMilling: number = 0;
  displayedHoursTurning: number = 0;
  displayedHoursOtherTasks: number = 0;
  displayedHoursDevelopers: number = 0;

  chartData: { label: string, value: number, color: string }[] = []; // Re-add chartData
  chartType: 'bar' | 'pie' = 'bar'; // New property to toggle chart type

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

  updateAnalytics(): void {
    this.calculateDisplayValues();
    this.updateChartData(); // Re-add chart data update
  }

  private calculateDisplayValues(): void {
    const hoursPerDayFactor = 3; // x * 3
    const totalHoursInDay = 24; // divide by 24 hours

    // Helper function to calculate days and remaining hours from a given number of hours
    const calculateDaysAndHours = (hours: number) => {
      const totalAdjustedHours = hours * hoursPerDayFactor;
      const days = Math.floor(totalAdjustedHours / totalHoursInDay);
      const remainingHours = totalAdjustedHours % totalHoursInDay;
      return { days, remainingHours };
    };

    // Ensure technologists are at least 1 for division to avoid NaN or Infinity
    const millingTechnologists = this.numberOfMillingTechnologists > 0 ? this.numberOfMillingTechnologists : 1;
    const turningTechnologists = this.numberOfTurningTechnologists > 0 ? this.numberOfTurningTechnologists : 1;
    const constructors = this.numberOfConstructors > 0 ? this.numberOfConstructors : 1;
    const totalTechnologistsForOther = (this.numberOfMillingTechnologists + this.numberOfTurningTechnologists) > 0 ? (this.numberOfMillingTechnologists + this.numberOfTurningTechnologists) : 1;

    // Calculate displayed hours based on technologists
    this.displayedHoursMilling = this.totalHoursMilling / millingTechnologists;
    this.displayedHoursTurning = this.totalHoursTurning / turningTechnologists;
    this.displayedHoursDevelopers = this.totalHoursDevelopers / constructors;

    // Calculate 'other tasks' hours directly from the original total and then divide
    const rawOtherTasksHours = this.totalHoursOtherTasks;
    this.displayedHoursOtherTasks = rawOtherTasksHours / totalTechnologistsForOther;

    this.displayedHoursAllTasks = this.displayedHoursMilling + this.displayedHoursTurning + this.displayedHoursOtherTasks + this.displayedHoursDevelopers;

    // Calculate days and remaining hours for each category
    const allTasksTime = calculateDaysAndHours(this.displayedHoursAllTasks);
    this.totalDaysAllTasks = allTasksTime.days;
    this.remainingHoursAllTasks = allTasksTime.remainingHours;

    const millingTime = calculateDaysAndHours(this.displayedHoursMilling);
    this.totalDaysMilling = millingTime.days;
    this.remainingHoursMilling = millingTime.remainingHours;

    const turningTime = calculateDaysAndHours(this.displayedHoursTurning);
    this.totalDaysTurning = turningTime.days;
    this.remainingHoursTurning = turningTime.remainingHours;

    const developersTime = calculateDaysAndHours(this.displayedHoursDevelopers);
    this.totalDaysDevelopers = developersTime.days;
    this.remainingHoursDevelopers = developersTime.remainingHours;

    const otherTasksTime = calculateDaysAndHours(this.displayedHoursOtherTasks);
    this.totalDaysOtherTasks = otherTasksTime.days;
    this.remainingHoursOtherTasks = otherTasksTime.remainingHours;
  }

  getMaxChartValue(): number {
    if (this.chartData.length === 0) {
      return 0;
    }
    return Math.max(...this.chartData.map(item => item.value));
  }

  private updateChartData(): void {
    this.chartData = [
      { label: 'Общее время', value: this.displayedHoursAllTasks, color: '#179edc' },
      { label: 'Фрезерные операции', value: this.displayedHoursMilling, color: '#50c878' },
      { label: 'Токарные операции', value: this.displayedHoursTurning, color: '#FFD700' },
      { label: 'Другие задачи', value: this.displayedHoursOtherTasks, color: '#FF6347' },
      { label: 'Разработка КД', value: this.displayedHoursDevelopers, color: '#800080' }
    ];
  }

  toggleChartType(): void {
    this.chartType = this.chartType === 'bar' ? 'pie' : 'bar';
  }

  getPieChartStyle(): string {
    const total = this.chartData.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
      return 'background-image: conic-gradient(#eee 0% 100%);'; // Grey circle if no data
    }

    let gradientString = 'conic-gradient(';
    let currentAngle = 0;

    this.chartData.forEach((item, index) => {
      const percentage = item.value / total;
      const angle = percentage * 360;
      
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;

      gradientString += `${item.color} ${startAngle}deg ${endAngle}deg${index < this.chartData.length - 1 ? ', ' : ''}`;
      currentAngle = endAngle;
    });

    // Ensure the last slice completes the circle in case of floating point inaccuracies
    if (currentAngle < 360) {
      gradientString += `, #eee ${currentAngle}deg 360deg`; // Fill remaining with a neutral color
    }

    gradientString += ');';
    return `background-image: ${gradientString}`;
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
      const developersTasksPromise = this.fetchFilteredTasks('Разработка'); // Fetch tasks with 'разработка кд'

      const [allTasks, millingTasks, turningTasks, developersTasks] = await Promise.all([
        allTasksPromise,
        millingTasksPromise,
        turningTasksPromise,
        developersTasksPromise
      ]);

      console.log('developersTasks:', developersTasks);
      console.log('turningTasks:', turningTasks);
      console.log('millingTasks:', millingTasks);
      console.log('allTasks:', allTasks); 

      console.log('loadAllTasks: All task lists fetched. Processing...');
      this.processTasks(allTasks, millingTasks, turningTasks, developersTasks);
    } catch (err) {
      console.error('loadAllTasks: Error in main task loading:', err);
      this.error = `Failed to load all tasks: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.loading = false;
      console.log('loadAllTasks: Finished.');
    }
  }

  processTasks(allTasks: Task[], millingTasks: Task[], turningTasks: Task[], developmentTasks: Task[]): void {
    let totalAll = 0;
    let totalMilling = 0;
    let totalTurning = 0;
    let totalOther = 0; // Initialize for other tasks
    let totalDevelopers = 0; // Initialize for development tasks

    console.log('processTasks: Starting with task lists:', { allTasks, millingTasks, turningTasks, developmentTasks });

    const millingTaskIds = new Set(millingTasks.map(task => task.id));
    const turningTaskIds = new Set(turningTasks.map(task => task.id));
    const developmentTaskIds = new Set(developmentTasks.map(task => task.id)); // Re-introducing this


    for (const task of allTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalAll += isNaN(duration) ? 0 : duration;


      // Only add to totalOther if it's not a milling, turning, or development task
      if (!millingTaskIds.has(task.id) && !turningTaskIds.has(task.id) && !developmentTaskIds.has(task.id)) {
        totalOther += isNaN(duration) ? 0 : duration;
      }
    }

    for (const task of millingTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalMilling += isNaN(duration) ? 0 : duration;
    }

    for (const task of turningTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalTurning += isNaN(duration) ? 0 : duration;
    }

    for (const task of developmentTasks) {
      const duration = parseFloat(task.durationPlan || '0');
      totalDevelopers += isNaN(duration) ? 0 : duration;
    }

    this.totalHoursAllTasks = totalAll;
    this.totalHoursMilling = totalMilling;
    this.totalHoursTurning = totalTurning;
    this.totalHoursOtherTasks = totalOther; // Assign calculated other tasks total
    this.totalHoursDevelopers = totalDevelopers; // Assign calculated development tasks total
    this.updateAnalytics(); // Calculate and display days/hours after initial load
    console.log('processTasks: Calculated totals:', {
      totalHoursAllTasks: this.totalHoursAllTasks,
      totalHoursMilling: this.totalHoursMilling,
      totalHoursTurning: this.totalHoursTurning,
      totalHoursOtherTasks: this.totalHoursOtherTasks,
      totalHoursDevelopers: this.totalHoursDevelopers,
    });
  }
}
