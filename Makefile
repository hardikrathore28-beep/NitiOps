.PHONY: up down logs health

up:
	docker-compose -f infra/docker-compose.yml up -d --build

down:
	docker-compose -f infra/docker-compose.yml down

logs:
	docker-compose -f infra/docker-compose.yml logs -f

health:
	@echo "Checking health of services..."
	@echo "Audit Service:"
	@docker-compose -f infra/docker-compose.yml exec -T audit-service wget -qO- http://localhost:3001/health || echo "Failed"
	@echo "\nPolicy Service:"
	@docker-compose -f infra/docker-compose.yml exec -T policy-service wget -qO- http://localhost:3002/health || echo "Failed"
