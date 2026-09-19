// Shared media failure type. It holds no configuration and no decoder
// dependency, so a bounded native-runtime probe can reuse the reviewed audio
// module without pulling the photo pipeline's image library in with it.
export class MediaError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}
