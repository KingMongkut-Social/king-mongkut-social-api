import { EmailVerificationModel } from '../modules/auth/auth.email-verification.model.js';
import { OAuthTransactionModel } from '../modules/auth/oauth-transaction.model.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { ChatMessageModel } from '../modules/chats/chat-message.model.js';
import { ChatModel } from '../modules/chats/chat.model.js';
import { FriendshipModel } from '../modules/friends/friendship.model.js';
import { GroupMemberModel } from '../modules/groups/group-member.model.js';
import { GroupPostModel } from '../modules/groups/group-post.model.js';
import { CommunityGroupModel } from '../modules/groups/group.model.js';
import { NotificationModel } from '../modules/notifications/notification.model.js';
import { PostBookmarkModel } from '../modules/posts/post-bookmark.model.js';
import { PostCommentModel } from '../modules/posts/post-comment.model.js';
import { PostLikeModel } from '../modules/posts/post-like.model.js';
import { PostModel } from '../modules/posts/post.model.js';
import { ReportModel } from '../modules/reports/report.model.js';
import { UserModel } from '../modules/users/user.model.js';

export const indexModels = [
  UserModel,
  EmailVerificationModel,
  OAuthTransactionModel,
  SessionModel,
  PostModel,
  PostLikeModel,
  PostBookmarkModel,
  PostCommentModel,
  FriendshipModel,
  ChatModel,
  ChatMessageModel,
  CommunityGroupModel,
  GroupMemberModel,
  GroupPostModel,
  NotificationModel,
  ReportModel,
] as const;
