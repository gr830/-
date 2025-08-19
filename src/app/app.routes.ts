import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Tasks } from './pages/tasks/tasks';
import { SearchComponent } from './pages/search/search';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'tasks', component: Tasks },
  { path: 'search', component: SearchComponent },
];
