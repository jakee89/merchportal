jest.mock("../catalog-data", () => ({ catalogRevision: jest.fn(), catalogSources: jest.fn() }))

import catalogWarmup from "../loaders/catalog-warmup"
import { catalogRevision, catalogSources } from "../catalog-data"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

describe("background catalogue warming", () => {
  const previousEnvironment = process.env.NODE_ENV
  const previousWorker = process.env.MEDUSA_WORKER_MODE
  const knex = jest.fn()
  const logger = { warn: jest.fn() }
  const manager = { getConnection: () => ({ getKnex: () => knex }) }
  const container = { resolve: jest.fn((key) => key === ContainerRegistrationKeys.MANAGER ? manager : logger) }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    process.env.NODE_ENV = "production"
    process.env.MEDUSA_WORKER_MODE = "server"
    jest.mocked(catalogRevision).mockImplementation(async (scope) => {
      expect(scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)).toBe(knex)
      return { source: "import-1", settings: "rules-1" }
    })
    jest.mocked(catalogSources).mockResolvedValue([])
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    if (previousEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnvironment
    if (previousWorker === undefined) delete process.env.MEDUSA_WORKER_MODE
    else process.env.MEDUSA_WORKER_MODE = previousWorker
  })

  it("does not block startup and warms the current snapshot using the existing connection", async () => {
    await catalogWarmup({ container } as any)
    expect(catalogSources).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(10_000)
    expect(catalogSources).toHaveBeenCalledWith(expect.anything(), "import-1")
    jest.mocked(catalogRevision).mockResolvedValue({ source: "import-2", settings: "rules-1" })
    await jest.advanceTimersByTimeAsync(50_000)
    expect(catalogSources).toHaveBeenLastCalledWith(expect.anything(), "import-2")
  })

  it("does not turn database warm-up failures into startup or authentication failures", async () => {
    jest.mocked(catalogSources).mockRejectedValue(new Error("temporarily unavailable"))
    await expect(catalogWarmup({ container } as any)).resolves.toBeUndefined()
    await jest.advanceTimersByTimeAsync(10_000)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it("does not load the catalog in a worker or development process", async () => {
    process.env.MEDUSA_WORKER_MODE = "worker"
    await catalogWarmup({ container } as any)
    process.env.MEDUSA_WORKER_MODE = "server"
    process.env.NODE_ENV = "development"
    await catalogWarmup({ container } as any)
    await jest.advanceTimersByTimeAsync(60_000)
    expect(catalogSources).not.toHaveBeenCalled()
  })
})
