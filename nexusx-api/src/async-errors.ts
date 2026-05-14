import Layer from "express/lib/router/layer";

type Next = (err?: unknown) => void;

const originalHandleRequest = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handleRequest(req: unknown, res: unknown, next: Next) {
  const fn = this.handle;

  if (fn.length > 3) {
    return originalHandleRequest.call(this, req, res, next);
  }

  try {
    const ret = fn(req, res, next);
    if (ret && typeof ret.catch === "function") {
      ret.catch(next);
    }
    return ret;
  } catch (err) {
    return next(err);
  }
};