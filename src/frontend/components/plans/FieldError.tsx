/**
 * Field message under the control that failed. Color is not the only signal.
 * @param props - Message props.
 * @param props.message - Sentence from the API `fields` map, or the empty-note sentence.
 * @param props.id - Optional id so the control can point at the message.
 * @returns The message, or nothing when there is no error.
 */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  );
}
