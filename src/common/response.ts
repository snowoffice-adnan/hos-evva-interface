export function ok(
  message: string,
  response: any,
  options?: { unwrapSingle?: boolean },
) {
  const unwrapSingle = options?.unwrapSingle ?? true;

  const base: any = {
    error: false,
    message,
    statusCode: 200,
  };

  if (response && typeof response === 'object' && 'data' in response) {
    Object.assign(base, response);

    if (unwrapSingle && Array.isArray(base.data) && base.data.length === 1) {
      base.data = base.data[0];
    }

    return base;
  }

  base.data = response;

  if (unwrapSingle && Array.isArray(base.data) && base.data.length === 1) {
    base.data = base.data[0];
  }

  return base;
}
