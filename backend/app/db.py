# 数据库模块：负责创建异步引擎、会话工厂，并对外提供会话依赖
# 使用 SQLAlchemy 2.0 异步风格 + aiosqlite 驱动（SQLite 异步访问）

from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from .config import settings


# 所有 ORM 模型的公共基类，models.py 中的表模型都继承自它
class Base(DeclarativeBase):
    pass


# 异步引擎：真正管理数据库连接池的对象
# echo=False 表示不打印 SQL 日志，调试数据库时可改为 True 查看每条 SQL
engine = create_async_engine(settings.database_url, echo=False)
# 会话工厂：调用 SessionLocal() 即可创建一个异步会话
# expire_on_commit=False：commit 之后对象属性不过期，避免异步环境下再次触发额外查询报错
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# FastAPI 依赖项：路由函数通过 Depends(get_session) 注入数据库会话
# yield 写法保证请求处理完毕后自动关闭会话、归还连接
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
