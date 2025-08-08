import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  username = '';
  password = '';
  error = '';

  constructor(private router: Router) {}

  login() {
    if (this.username === 'gros' && this.password === '5544') {
      this.error = '';
      localStorage.setItem('isAuth', '1');
      this.router.navigate(['/tasks']);
    } else {
      this.error = 'Неверный логин или пароль';
      localStorage.removeItem('isAuth');
    }
  }
}
