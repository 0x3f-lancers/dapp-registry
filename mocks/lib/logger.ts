// This file will be automatically used by Jest when it encounters `import logger from '../lib/logger'`

interface MockLoggerInstance {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  trace: jest.Mock;
  child: jest.Mock;
}

let mockLogger: MockLoggerInstance;

const mockError = jest.fn();
const mockWarn = jest.fn();
const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockTrace = jest.fn();

const mockChild = jest.fn(() => mockLogger);

mockLogger = {
  error: mockError,
  warn: mockWarn,
  info: mockInfo,
  debug: mockDebug,
  trace: mockTrace,
  child: mockChild,
};

export default mockLogger;
