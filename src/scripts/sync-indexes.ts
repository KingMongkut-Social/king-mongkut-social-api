import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { OAuthTransactionModel } from '../modules/auth/oauth-transaction.model.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { PostModel } from '../modules/posts/post.model.js';
import { PostLikeModel } from '../modules/posts/post-like.model.js';
import { PostBookmarkModel } from '../modules/posts/post-bookmark.model.js';
import { PostCommentModel } from '../modules/posts/post-comment.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { FriendshipModel } from '../modules/friends/friendship.model.js';
import { ChatModel } from '../modules/chats/chat.model.js';
import { ChatMessageModel } from '../modules/chats/chat-message.model.js';
import { CommunityGroupModel } from '../modules/groups/group.model.js';
import { GroupMemberModel } from '../modules/groups/group-member.model.js';
import { GroupInviteModel } from '../modules/groups/group-invite.model.js';
import { GroupPostModel } from '../modules/groups/group-post.model.js';
import { NotificationModel } from '../modules/notifications/notification.model.js';
import { ReportModel } from '../modules/reports/report.model.js';

async function main(): Promise<void> {
  await connectDatabase();
  await Promise.all([
    UserModel.syncIndexes(),
    OAuthTransactionModel.syncIndexes(),
    SessionModel.syncIndexes(),
    PostModel.syncIndexes(),
    PostLikeModel.syncIndexes(),
    PostBookmarkModel.syncIndexes(),
    PostCommentModel.syncIndexes(),
    FriendshipModel.syncIndexes(),
    ChatModel.syncIndexes(),
    ChatMessageModel.syncIndexes(),
    CommunityGroupModel.syncIndexes(),
    GroupMemberModel.syncIndexes(),
    GroupInviteModel.syncIndexes(),
    GroupPostModel.syncIndexes(),
    NotificationModel.syncIndexes(),
    ReportModel.syncIndexes(),
  ]);
  logger.info('MongoDB indexes synchronized');
  await disconnectDatabase();
}

void main().catch((error) => {
  logger.fatal({ err: error }, 'Index synchronization failed');
  process.exit(1);
});
