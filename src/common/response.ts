export function ok(message: string, response: any) {
  const base = {
    error: false,
    message,
    statusCode: 200,
  } as any;

  if (response && typeof response === 'object' && 'data' in response) {
    Object.assign(base, response);

    // If base.data is an array with 1 element → unwrap
    if (Array.isArray(base.data) && base.data.length === 1) {
      base.data = base.data[0];
    }

    return base;
  }

  base.data = response;

  if (Array.isArray(base.data) && base.data.length === 1) {
    base.data = base.data[0];
  }

  return base;
}
