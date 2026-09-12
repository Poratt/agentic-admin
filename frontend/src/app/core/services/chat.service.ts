import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { IChatSession } from '../models/chat-session.interface';
import { IChatMessage, ChatModelSelection, ChatStreamEvent } from '../models/chat-message.interface';
import { ServiceResultContainer } from '../models/service-result-container.model';
import { AuthService } from './auth.service';

@Injectable({
	providedIn: 'root',
})
export class ChatService {
	private base = `${environment.apiUrl}/admin-agent`;

	constructor(
		private http: HttpClient,
		private authService: AuthService,
	) {}

	listSessions(limit?: number): Observable<IChatSession[]> {
		const url = limit ? `${this.base}/sessions?limit=${limit}` : `${this.base}/sessions`;
		return this.http
			.get<ServiceResultContainer<IChatSession[]>>(url)
			.pipe(map((res) => res.result));
	}

	getSessionMessages(sessionId: number): Observable<{ messages: IChatMessage[]; hasMoreImages: boolean }> {
		return new Observable((observer) => {
			this.http
				.get<ServiceResultContainer<IChatMessage[]>>(`${this.base}/sessions/${sessionId}/messages`, {
					observe: 'response',
				})
				.subscribe({
					next: (response) => {
						const hasMoreImages = response.headers.get('x-has-more-images') === 'true';
						observer.next({ messages: response.body?.result ?? [], hasMoreImages });
						observer.complete();
					},
					error: (err) => observer.error(err),
				});
		});
	}

	getMessageImages(messageIds: number[]): Observable<Record<number, string | null>> {
		return this.http
			.post<ServiceResultContainer<Record<number, string | null>>>(`${this.base}/messages/images`, {
				messageIds,
			})
			.pipe(map((res) => res.result));
	}

	createSession(): Observable<IChatSession> {
		return this.http
			.post<ServiceResultContainer<IChatSession>>(`${this.base}/sessions`, {})
			.pipe(map((res) => res.result));
	}

	deleteSession(sessionId: number): Observable<void> {
		return this.http.delete<void>(`${this.base}/sessions/${sessionId}`);
	}

	deleteMessage(sessionId: number, messageId: number): Observable<void> {
		return this.http.delete<void>(`${this.base}/sessions/${sessionId}/messages/${messageId}`);
	}

	confirmAction(actionId: string, confirmed: boolean): Observable<{ success: boolean; message: string; result?: unknown }> {
		return this.http.post<{ success: boolean; message: string; result?: unknown }>(`${this.base}/confirm-action`, { actionId, confirmed });
	}

	sendMessageStream(
		prompt: string,
		sessionId?: number,
		modelSelection?: ChatModelSelection,
		image?: string,
	): Observable<ChatStreamEvent> {
		return new Observable((observer) => {
			const controller = new AbortController();
			let buffer = '';

			const attemptFetch = (isRetry: boolean) => {
				fetch(`${this.base}/query-stream`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt, sessionId, image, ...modelSelection }),
					credentials: 'include',
					signal: controller.signal,
				})
					.then(async (response) => {
						if (response.status === 401 && !isRetry) {
							try {
								await firstValueFrom(this.authService.refresh());
								attemptFetch(true);
							} catch {
								observer.error(new Error('Session expired, please log in again'));
							}
							return;
						}

						if (!response.ok) {
							observer.error(new Error(`Failed to initialize stream: ${response.statusText}`));
							return;
						}

						const reader = response.body?.getReader();
						const decoder = new TextDecoder('utf-8');

						if (!reader) {
							observer.error(new Error('Response body reader is not available'));
							return;
						}

						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) {
									break;
								}

								buffer += decoder.decode(value, { stream: true });
								const lines = buffer.split('\n');

								// Keep the last line in case it is fragmented
								buffer = lines.pop() || '';

								for (const line of lines) {
									const trimmed = line.trim();
									if (trimmed) {
										try {
											const parsed = JSON.parse(trimmed);
											observer.next(parsed);
										} catch (err) {
											console.warn('Failed to parse line-JSON streaming chunk:', trimmed, err);
										}
									}
								}
							}

							// Process the leftovers remaining in the buffer
							if (buffer.trim()) {
								try {
									const parsed = JSON.parse(buffer.trim());
									observer.next(parsed);
								} catch (err) {
									console.warn('Failed to parse trailing-JSON streaming chunk:', buffer, err);
								}
							}

							observer.complete();
						} catch (err) {
							observer.error(err);
						}
					})
					.catch((err) => {
						if (err.name !== 'AbortError') {
							observer.error(err);
						}
					});
			};

			attemptFetch(false);

			return () => {
				controller.abort();
			};
		});
	}
}
