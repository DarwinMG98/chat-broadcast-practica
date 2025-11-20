import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketService {
  socket!: Socket;

  connect(token: string) {
    this.socket = io('http://localhost:3000', { auth: { token } });
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }

  listen(event: string): Observable<any> {
    return new Observable(res => {
      this.socket.on(event, (d:any) => res.next(d));
    });
  }

  emit(event: string, payload?: any) {
    this.socket.emit(event, payload);
  }

  getId(): string | undefined { return this.socket.id; }
}