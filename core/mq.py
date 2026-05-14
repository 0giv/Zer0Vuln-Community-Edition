import aio_pika
import json
import os
from datetime import datetime

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq/")

AI_AUTOMATION = "ai_automation_queue"
AI_MANUAL     = "ai_manual_queue"
AI_SOAR       = "ai_soar_queue"

async def publish_to_queue(queue_name: str, agent: str, table: str, data: any, metadata: dict = None):
    """Publish a task to a specific RabbitMQ queue"""
    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            
            await channel.declare_queue(queue_name, durable=True)
            
            payload = {
                "agent": agent,
                "table": table,
                "data": data,
                "timestamp": datetime.now().isoformat(),
                "metadata": metadata or {}
            }
            
            await channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(payload, default=str).encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                ),
                routing_key=queue_name,
            )
            print(f"[RabbitMQ] Published {table} for {agent} to {queue_name}")
            return True
    except Exception as e:
        print(f"[!] RabbitMQ publish error to {queue_name}: {e}")
        return False
