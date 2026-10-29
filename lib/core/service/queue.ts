/**
 * 写操作全局单写者队列：`add` 会同时改 canonical 与 lock，按技能分桶没有意义（设计 §14.3）。
 * 拆分前在 `lib/core/service.ts` 模块顶层。
 */
import { ServiceError } from './errors.js';

const QUEUE_LIMIT = 8;

export function createQueue(logger) {
  let chain = Promise.resolve();
  let pending = 0;
  const enqueue = function enqueue(label, task) {
    if (pending >= QUEUE_LIMIT) {
      throw new ServiceError('error.skills.queue-full', '写操作排队过多，请稍后重试');
    }
    pending += 1;
    const run = chain.then(
      () => task(),
      () => task(),
    );
    chain = run.then(
      () => {
        pending -= 1;
      },
      () => {
        pending -= 1;
      },
    );
    logger('queue.run', { label, pending });
    return run;
  };
  enqueue.pending = () => pending;
  return enqueue;
}
