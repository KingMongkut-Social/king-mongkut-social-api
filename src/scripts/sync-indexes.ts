import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { CommentModel } from '../modules/comments/comment.model.js';
import { FriendshipModel } from '../modules/friends/friendship.model.js';
import { PostModel } from '../modules/posts/post.model.js';
import { ReactionModel } from '../modules/reactions/reaction.model.js';
import { UserModel } from '../modules/users/user.model.js';

async function main(): Promise<void> {
  await connectDatabase();
  await Promise.all([
    UserModel.syncIndexes(),
    SessionModel.syncIndexes(),
    PostModel.syncIndexes(),
    CommentModel.syncIndexes(),
    ReactionModel.syncIndexes(),
    FriendshipModel.syncIndexes(),
  ]);
  logger.info('MongoDB indexes synchronized');
  await disconnectDatabase();
}

void main().catch((error) => {
  logger.fatal({ err: error }, 'Index synchronization failed');
  process.exit(1);
});
