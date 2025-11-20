import { Component } from '@angular/core';
import { SocketService } from './socket.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

// Material modules (the user should `ng add @angular/material` and install)
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, MatToolbarModule, MatButtonModule, MatInputModule, MatListModule, MatCardModule, MatIconModule],
  template: `
    <div class="app-container">
      <mat-toolbar color="primary">
        <mat-icon>chat_bubble</mat-icon>
        &nbsp; Angular Chat (roles + rooms + private + JWT)
      </mat-toolbar>

      <div class="main-content">
      <mat-card class="sidebar-card">
        <div class="login-section">
          <h3>Login (demo)</h3>
          <mat-form-field appearance="fill">
            <mat-label>Username (alice|bob|carla)</mat-label>
            <input matInput [(ngModel)]="username" />
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="login()">Login</button>
          <div *ngIf="me" class="success-message">
            <small>Conectado como: {{me.username}} ({{me.role}})</small>
          </div>
        </div>

        <div class="rooms-section">
          <h4>Salas</h4>
          <mat-form-field appearance="fill">
            <mat-label>Nueva sala</mat-label>
            <input matInput [(ngModel)]="newRoom" />
          </mat-form-field>
          <button mat-button (click)="createOrJoin()">Crear/Entrar</button>

          <h5>Rooms</h5>
          <mat-list class="rooms-list">
            <mat-list-item
              *ngFor="let r of rooms"
              class="room-item"
              [class.selected]="r === currentRoom"
              (click)="selectRoom(r)">
              {{r}}
            </mat-list-item>
          </mat-list>
          <button mat-button color="warn" (click)="deleteRoom()">Eliminar sala seleccionada (admin)</button>
        </div>
      </mat-card>

      <mat-card class="chat-card">
        <h3>Chat - Sala: {{currentRoom || '---'}}</h3>
        <div class="chat-messages">
          <div *ngFor="let m of mensajes" class="message" [ngClass]="getMessageClass(m)" [attr.data-sender]="getSender(m)">
            <div class="avatar" aria-hidden [attr.data-initial]="getSenderInitial(m)"></div>
            <div class="message-body">{{m}}</div>
          </div>
        </div>

        <div class="message-input">
          <mat-form-field appearance="fill">
            <mat-label>Mensaje</mat-label>
            <input matInput [(ngModel)]="msg" (keyup.enter)="sendRoom()" />
          </mat-form-field>
        </div>

        <div class="action-buttons">
          <button mat-raised-button color="primary" (click)="sendRoom()">Enviar a sala</button>
          <button mat-button (click)="broadcast()">Broadcast (admin)</button>
        </div>

        <div class="private-section">
          <h4>Privado</h4>
          <mat-form-field appearance="fill">
            <mat-label>To socket id</mat-label>
            <input matInput [(ngModel)]="toId" />
          </mat-form-field>
          <button mat-button (click)="sendPrivate()">Enviar privado</button>
        </div>
      </mat-card>

      <mat-card class="users-card">
        <h4>Usuarios conectados</h4>
        <mat-list class="users-list">
          <mat-list-item *ngFor="let u of users" class="user-item">
            {{u.username}} ({{u.role}}) - {{u.id}}
          </mat-list-item>
        </mat-list>
      </mat-card>
    </div>
  `
})
export class AppComponent {
  username = '';
  me: any = null;
  token = '';
  rooms: string[] = [];
  currentRoom = '';
  newRoom = '';
  mensajes: string[] = [];
  msg = '';
  users: any[] = [];
  toId = '';

  constructor(private sock: SocketService) {
    // listeners will be set after connect
  }

  getSender(message: string): string {
    try {
      // messages are in formats like: [room] from: message OR [GLOBAL] from: message OR [PRIV] from: message
      if (!message) return '';
      if (message.startsWith('[SYS]')) return 'Sistema';
      const afterBracket = message.indexOf(']');
      if (afterBracket === -1) return '';
      const rest = message.substring(afterBracket + 1).trim();
      const colonIdx = rest.indexOf(':');
      if (colonIdx === -1) return '';
      return rest.substring(0, colonIdx).trim();
    } catch (e) {
      return '';
    }
  }

  getSenderInitial(message: string): string {
    const s = this.getSender(message);
    return s ? s.charAt(0).toUpperCase() : '';
  }

  async login() {
    if (!this.username) return alert('Ingrese username (alice|bob|carla)');
    // call backend login
    try {
      const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username })
      });
      const data = await res.json();
      if (!res.ok) return alert(JSON.stringify(data));
      this.token = data.token;
      this.me = { username: data.username, role: data.role };
      this.sock.connect(this.token);

      // setup socket listeners
      this.sock.listen('rooms').subscribe((r:any)=> this.rooms = r);
      this.sock.listen('system').subscribe((d:any)=> this.mensajes.push('[SYS] ' + d.msg));
      this.sock.listen('roomMessage').subscribe((d:any)=> this.mensajes.push('['+d.room+'] '+d.from+': '+d.message));
      this.sock.listen('broadcast').subscribe((d:any)=> this.mensajes.push('[GLOBAL] '+d.from+': '+d.message));
      this.sock.listen('privateMessage').subscribe((d:any)=> this.mensajes.push('[PRIV] '+d.from+': '+d.message));
      this.sock.listen('presence').subscribe((p:any)=> this.users = p.clients);
      // request rooms list
      this.sock.emit('listRooms');
    } catch (err) {
      alert('Error al llamar login: ' + err);
    }
  }

  createOrJoin() {
    if (!this.newRoom) return;
    this.currentRoom = this.newRoom;
    this.sock.emit('createOrJoinRoom', this.newRoom);
    this.newRoom = '';
  }

  sendRoom() {
    if (!this.currentRoom) return alert('Selecciona o crea una sala');
    this.sock.emit('roomMessage', { room: this.currentRoom, message: this.msg });
    this.msg = '';
  }

  broadcast() {
    if (!this.me) return;
    this.sock.emit('broadcast', this.msg);
    this.msg = '';
  }

  sendPrivate() {
    if (!this.toId) return alert('Ingrese socket id del destinatario');
    this.sock.emit('privateMessage', { toSocketId: this.toId, message: this.msg });
    this.msg = '';
  }

  deleteRoom() {
    if (!this.currentRoom) return alert('Selecciona sala a eliminar');
    this.sock.emit('deleteRoom', this.currentRoom);
    this.currentRoom = '';
  }

  selectRoom(room: string) {
    if (this.currentRoom) {
      this.sock.emit('leaveRoom', this.currentRoom);
    }
    this.currentRoom = room;
    this.sock.emit('createOrJoinRoom', room);
  }

  getMessageClass(message: string): string {
    if (message.startsWith('[SYS]')) return 'system';
    // mark mine messages based on username available in component
    const isMine = this.me && message.includes(this.me.username + ':');
    if (isMine) return 'mine';
    if (message.startsWith('[') && message.includes(']')) {
      const prefix = message.substring(1, message.indexOf(']'));
      if (prefix === 'GLOBAL') return 'broadcast';
      if (prefix === 'PRIV') return 'private';
      return 'room';
    }
    return '';
  }
}