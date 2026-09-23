import mongoose from 'mongoose';

const HOUR_KEY = /^\d{4}-\d{2}-\d{2}T\d{2}$/;

const suggestHourSchema = new mongoose.Schema(
  {
    hour: {
      type: String,
      required: true,
      match: [HOUR_KEY, 'hour must be YYYY-MM-DDTHH.'],
    },
    count: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'count must be an integer.',
      },
    },
  },
  { collection: 'suggest_hours' },
);

suggestHourSchema.index({ hour: 1 }, { unique: true });

function compileSuggestHourModel() {
  return mongoose.model('SuggestHour', suggestHourSchema);
}

/**
 * Returns the compiled SuggestHour model on the active Mongoose connection.
 * @returns The `suggest_hours` collection model.
 */
export function suggestHourModel(): ReturnType<typeof compileSuggestHourModel> {
  const existing = mongoose.models.SuggestHour as ReturnType<typeof compileSuggestHourModel> | undefined;
  return existing ?? compileSuggestHourModel();
}
