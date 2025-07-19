import environ

env = environ.Env()
environ.Env.read_env()

# Тест чтения переменной
print("SECRET_KEY:", env("SECRET_KEY", default="НЕ НАШЁЛ"))
