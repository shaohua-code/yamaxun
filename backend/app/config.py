# 全局配置模块：通过 pydantic-settings 读取 .env 文件中的环境变量
# 优先级：环境变量 > .env 文件 > 下面代码里的默认值

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend 目录的绝对路径：保证无论从哪个目录启动服务，都能准确找到 .env
# （相对路径 ".env" 是按"启动时的工作目录"解析的，从项目根目录启动时会读不到，导致配置不生效）
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # 应用名称，展示在 Swagger 文档标题上
    app_name: str = "commerce-workbench-api"
    # 数据库连接串，默认使用项目根目录下的 SQLite 文件（异步驱动 aiosqlite）
    # 如需切换 MySQL/PostgreSQL，改这行并安装对应异步驱动即可
    database_url: str = "sqlite+aiosqlite:///./commerce.db"
    # AI 服务地址：OpenAI 兼容接口网关，可替换为 DeepSeek / 通义千问等
    ai_base_url: str = "https://api.openai.com/v1"
    # AI 密钥，为空时 AI 改写接口会走降级逻辑（直接返回原文草稿）
    ai_api_key: str = ""
    # 模型名称，例如 "gpt-4o-mini"、"deepseek-chat"
    ai_model: str = ""
    # 允许跨域访问的前端地址，多个用英文逗号分隔；"*" 表示放开所有来源
    frontend_origins: str = "*"
    # env_file 指定从哪个文件读配置（绝对路径，避免工作目录不同导致读不到）；
    # extra="ignore" 表示忽略 .env 中未定义的变量，不报错
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")


# 全局单例：其他模块直接 from .config import settings 使用
settings = Settings()
