import fs from 'fs';
import path from 'path';

export interface LoadedSkill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

export class SkillLoader {
  private skillsDir: string;

  constructor(customSkillsDir?: string) {
    this.skillsDir = customSkillsDir || path.join(process.cwd(), '.agents', 'skills');
  }

  public loadAllSkills(): LoadedSkill[] {
    const loadedSkills: LoadedSkill[] = [];

    if (!fs.existsSync(this.skillsDir)) {
      console.log(`[SKILL LOADER] Skills directory not found at: ${this.skillsDir}`);
      return loadedSkills;
    }

    try {
      const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFilePath = path.join(this.skillsDir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillFilePath)) {
            const fileContent = fs.readFileSync(skillFilePath, 'utf8');
            const { name, description, body } = this.parseSkillFrontmatter(fileContent, entry.name);

            loadedSkills.push({
              name,
              description,
              content: body,
              filePath: skillFilePath,
            });

            console.log(`[SKILL LOADER] Loaded skill: "${name}" (${entry.name})`);
          }
        }
      }
    } catch (err: any) {
      console.error('[SKILL LOADER] Error reading skills directory:', err.message);
    }

    return loadedSkills;
  }

  private parseSkillFrontmatter(content: string, folderName: string): { name: string; description: string; body: string } {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        name: folderName,
        description: 'Custom Athena Agent Skill',
        body: content,
      };
    }

    const yamlBlock = match[1];
    const body = match[2].trim();

    let name = folderName;
    let description = 'Custom Athena Agent Skill';

    const nameMatch = yamlBlock.match(/name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = yamlBlock.match(/description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();

    return { name, description, body };
  }
}
