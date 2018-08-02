const createAdmin = require('../index')
const { KafkaJSProtocolError } = require('../../errors')
const { createErrorFromCode } = require('../../protocol/error')

const { secureRandom, createCluster, newLogger } = require('testHelpers')

const NOT_CONTROLLER = 41
const TOPIC_ALREADY_EXISTS = 36

describe('Admin', () => {
  let topicName, admin

  beforeEach(() => {
    topicName = `test-topic-${secureRandom()}`
  })

  afterEach(async () => {
    await admin.disconnect()
  })

  describe('createTopics', () => {
    test('throws an error if the topics array is invalid', async () => {
      admin = createAdmin({ cluster: createCluster(), logger: newLogger() })
      await expect(admin.createTopics({ topics: null })).rejects.toHaveProperty(
        'message',
        'Invalid topics array null'
      )

      await expect(admin.createTopics({ topics: 'this-is-not-an-array' })).rejects.toHaveProperty(
        'message',
        'Invalid topics array this-is-not-an-array'
      )
    })

    test('throws an error if the topic name is not a valid string', async () => {
      admin = createAdmin({ cluster: createCluster(), logger: newLogger() })
      await expect(admin.createTopics({ topics: [{ topic: 123 }] })).rejects.toHaveProperty(
        'message',
        'Invalid topics array, the topic names have to be a valid string'
      )
    })

    test('throws an error if there are multiple entries for the same topic', async () => {
      admin = createAdmin({ cluster: createCluster(), logger: newLogger() })
      const topics = [{ topic: 'topic-123' }, { topic: 'topic-123' }]
      await expect(admin.createTopics({ topics })).rejects.toHaveProperty(
        'message',
        'Invalid topics array, it cannot have multiple entries for the same topic'
      )
    })

    test('create the new topics and return true', async () => {
      admin = createAdmin({ cluster: createCluster(), logger: newLogger() })

      await admin.connect()
      await expect(
        admin.createTopics({
          waitForLeaders: false,
          topics: [{ topic: topicName }],
        })
      ).resolves.toEqual(true)
    })

    test('retries if the controller has moved', async () => {
      const cluster = createCluster()
      const broker = { createTopics: jest.fn(() => true) }

      cluster.refreshMetadata = jest.fn()
      cluster.findControllerBroker = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new KafkaJSProtocolError(createErrorFromCode(NOT_CONTROLLER))
        })
        .mockImplementationOnce(() => broker)

      admin = createAdmin({ cluster, logger: newLogger() })
      await expect(
        admin.createTopics({
          waitForLeaders: false,
          topics: [{ topic: topicName }],
        })
      ).resolves.toEqual(true)

      expect(cluster.refreshMetadata).toHaveBeenCalledTimes(2)
      expect(cluster.findControllerBroker).toHaveBeenCalledTimes(2)
      expect(broker.createTopics).toHaveBeenCalledTimes(1)
    })

    test('ignore already created topics and return false', async () => {
      const cluster = createCluster()
      const broker = { createTopics: jest.fn() }

      cluster.refreshMetadata = jest.fn()
      cluster.findControllerBroker = jest.fn(() => broker)
      broker.createTopics.mockImplementationOnce(() => {
        throw new KafkaJSProtocolError(createErrorFromCode(TOPIC_ALREADY_EXISTS))
      })

      admin = createAdmin({ cluster, logger: newLogger() })
      await expect(
        admin.createTopics({
          waitForLeaders: false,
          topics: [{ topic: topicName }],
        })
      ).resolves.toEqual(false)

      expect(cluster.refreshMetadata).toHaveBeenCalledTimes(1)
      expect(cluster.findControllerBroker).toHaveBeenCalledTimes(1)
      expect(broker.createTopics).toHaveBeenCalledTimes(1)
    })

    test('query metadata if waitForLeaders is true', async () => {
      const topic2 = `test-topic-${secureRandom()}`
      const topic3 = `test-topic-${secureRandom()}`

      const cluster = createCluster()
      const broker = { createTopics: jest.fn(), metadata: jest.fn(() => true) }

      cluster.refreshMetadata = jest.fn()
      cluster.findControllerBroker = jest.fn(() => broker)

      broker.createTopics.mockImplementationOnce(() => true)
      admin = createAdmin({ cluster, logger: newLogger() })

      await expect(
        admin.createTopics({
          waitForLeaders: true,
          topics: [{ topic: topicName }, { topic: topic2 }, { topic: topic3 }],
        })
      ).resolves.toEqual(true)

      expect(broker.metadata).toHaveBeenCalledTimes(1)
      expect(broker.metadata).toHaveBeenCalledWith([topicName, topic2, topic3])
    })
  })

  it('gives access to its logger', () => {
    expect(
      createAdmin({
        cluster: createCluster(),
        logger: newLogger(),
      }).logger()
    ).toMatchSnapshot()
  })
})
