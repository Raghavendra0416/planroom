import mongoose from 'mongoose';
import type { Role } from '@/backend/models/types';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: {
      type: String,
      enum: ['TEACHER', 'HOD'] satisfies readonly Role[],
      default: 'TEACHER' satisfies Role,
    },
    passwordHash: { type: String, required: true },
  },
  { collection: 'users', timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });

function compileUserModel() {
  return mongoose.model('User', userSchema);
}

/**
 * Returns the compiled User model on the active Mongoose connection.
 * @returns The `users` collection model.
 */
export function userModel(): ReturnType<typeof compileUserModel> {
  const existing = mongoose.models.User as ReturnType<typeof compileUserModel> | undefined;
  return existing ?? compileUserModel();
}
