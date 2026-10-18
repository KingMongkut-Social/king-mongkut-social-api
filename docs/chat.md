# Friends and real-time chat

## Chat images

`POST /api/v1/chats/uploads` accepts one multipart field named `file` (JPEG, PNG, GIF, WebP or AVIF, up to 10 MB) and returns `data.image.url`. Include up to four returned URLs in a message's `images` array. A sender may attach their own uploads or images already shared in one of their conversations.

`GET /api/v1/chats/uploads/:filename` requires the bearer token. The uploader can read the image before sending; after sending, members of the conversation can also read it. Anonymous requests return 401 and unauthorized images return 404. Existing images in message history use the same membership check. Responses use `Cache-Control: private, no-store`.

Browser clients must fetch images with the authorization header, turn the response blob into an object URL, and revoke that URL when leaving the page. A plain `<img src="/api/v1/chats/uploads/...">` cannot supply the bearer header. Deploy the app and API changes together.

The friends and chat APIs use the usual `/api/v1` prefix. Send the access token in an `Authorization: Bearer <token>` header. The account must be active and its faculty and department must be saved. API responses use `{ success: true, data }` or `{ success: false, error: { code, message } }`.

## Friends

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/friends/search?q=...&university=KMITL` | Find users and their relationship to you |
| `GET` | `/friends/users/:userId` | Get one user's public profile and relationship to you |
| `GET` | `/friends` | List accepted friends |
| `GET` | `/friends/requests` | List `{ incoming, outgoing }` pending requests |
| `GET` | `/friends/suggestions?limit=20` | List active people you may know, ordered by shared friends |
| `POST` | `/friends/request` | Send `{ "targetUserId": "..." }` |
| `POST` | `/friends/respond` | Send `{ "requestId": "...", "action": "accept" }` or `"reject"` |
| `DELETE` | `/friends/requests/:requestId` | Cancel your own outgoing pending request |

Search and individual connection results have `id`, `name`, `university`, optional `faculty` and `department`, plus `relationshipStatus`, `requestId`, and `mutualFriendCount`. Relationship status is `none`, `pending_sent`, `pending_received`, or `friends`. Mutual counts include only active accepted friends shared with you. The accepted friend list adds `friendshipId` and `isOnline` (a boolean snapshot of whether that friend currently has an authenticated socket connection). Pending requests are `{ id, requester, recipient, createdAt }`; `requester` and `recipient` are public users. Only the recipient can accept or reject a request, and only the sender can cancel a pending request. A direct chat becomes available after acceptance. A search returns at most 50 users.

Suggestions return public connection summaries with `relationshipStatus: "none"`, `requestId: null`, and `mutualFriendCount`. They exclude you, current friends, pending requests, and inactive accounts. The endpoint ranks users with shared friends first and fills remaining slots with other active users sorted by name. `limit` defaults to 20 and accepts 1–50. Send a friend request with `POST /friends/request` from a suggestion card.

## Conversations and messages

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/chats` | List your conversations |
| `POST` | `/chats/direct` | Open a direct conversation with `{ "userId": "..." }` |
| `POST` | `/chats/groups` | Create a group with `{ "name": "Project", "memberIds": ["...", "..."] }` |
| `GET` | `/chats/:chatId/messages?limit=30&before=<messageId>` | Read newest messages first; use `before` for older messages |
| `POST` | `/chats/:chatId/messages` | Send `{ "content": "Hello" }` |

Direct conversations require an accepted friendship. Opening an existing direct conversation returns it again with HTTP 200; a new conversation returns HTTP 201. Group members selected at creation must be accepted friends of the creator. A group name has 1–80 characters, and `memberIds` contains 1–49 distinct friends. Message content has 1–4000 characters after trimming. Only conversation members can read or send messages. History defaults to 30 messages per request and permits up to 100. The `before` cursor must identify a message in that conversation. A conversation has this shape:

```ts
type PublicUser = {
  id: string;
  name: string;
  university: 'KMITL' | 'KMUTNB' | 'KMUTT';
  faculty?: string;
  department?: string;
};

type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: PublicUser[];
  lastMessage: Message | null;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
};
```

## Socket.IO

Connect to the API origin with the current access token in Socket.IO `auth`. Each connected account receives events for its own conversations. Reconnect with a refreshed access token if authentication expires.

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: accessToken },
});

socket.on('message:new', (message: Message) => {
  // Add the message to its open conversation.
});
socket.on('conversation:updated', (conversation: Conversation) => {
  // Refresh or reorder the conversation list.
});
socket.on('friend:updated', (update: { userId: string; friendshipId: string; status: 'pending' | 'accepted' | 'rejected' }) => {
  // Refresh the friend and pending-request lists.
});
socket.on('presence:updated', (update: { userId: string; isOnline: boolean }) => {
  // Update this accepted friend's online indicator.
});

socket.emit('chat:send', { chatId, content: 'Hello' }, (reply: 
  | { success: true; data: Message }
  | { success: false; error: { code: string; message: string } }
) => {
  // Confirm delivery or show the error.
});
```

Socket authentication uses the access token, not the refresh cookie. The server disconnects a socket when its token expires and checks account status again for each `chat:send`. Presence changes are sent only to accepted friends when the first socket connects or the last socket disconnects. Refresh `/friends` on socket reconnection for a current snapshot. A successful send persists the message and broadcasts `message:new` and `conversation:updated` to current members. The REST send endpoint supports the same operation, so clients may use either one to send a message.
