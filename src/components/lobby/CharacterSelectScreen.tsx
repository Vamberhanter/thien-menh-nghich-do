import { useState } from 'react';
import { CHARACTER_NAME, type NetCharacter } from '../../net/types';
import type { AvatarRecord } from '../../net/avatarStore';
import { CLASSES, classOf, LOCKED_CLASSES, type ClassEntry, type CreationMode, type Gender } from './classes';
import { OrnateButton, Plate } from './parts';

const RATING_LABELS: readonly { key: keyof ClassEntry['ratings']; label: string }[] = [
  { key: 'attack', label: 'Tấn công' },
  { key: 'defense', label: 'Phòng thủ' },
  { key: 'hp', label: 'Sinh lực' },
  { key: 'speed', label: 'Tốc độ' },
  { key: 'control', label: 'Không chế' },
];

const SKILL_TIERS = ['Khởi thủ', 'Trung cấp', 'Cao cấp', 'Tuyệt kỹ'];

type InfoTab = 'info' | 'skills';

/**
 * The whole "pick or forge a hero" screen — one dedicated view instead of
 * the class palette, stats dots and thumbnail row that used to sit split
 * across three different panels. Room/chat live entirely on their own step
 * now (`Lobby`'s `join` view); this one only ever ends by creating a hero
 * or picking a saved one, at which point `Lobby` moves on by itself.
 */
export function CharacterSelectScreen({
  mode,
  pick,
  onPick,
  gender,
  onGender,
  name,
  onName,
  onForge,
  busy,
  avatars,
  avatarId,
  onAvatar,
  onDeleteAvatar,
}: {
  mode: CreationMode;
  pick: NetCharacter;
  onPick: (id: NetCharacter) => void;
  gender: Gender;
  onGender: (gender: Gender) => void;
  name: string;
  onName: (name: string) => void;
  onForge: () => void;
  busy: boolean;
  avatars: readonly AvatarRecord[];
  avatarId: string;
  onAvatar: (row: AvatarRecord) => void;
  onDeleteAvatar: (row: AvatarRecord) => void;
}) {
  const [tab, setTab] = useState<InfoTab>('info');
  const creating = mode === 'create';
  const entry = classOf(pick);
  const selectedAvatar = avatars.find((row) => row.id === avatarId) ?? null;

  return (
    <div className="rod-select">
      <section className="rod-select__list rod-frame">
        <Plate title="Danh Sách Nhân Vật" sub={creating ? 'Chọn hệ phái' : 'Nhân vật đã lưu'} />
        <div className="rod-select__list-scroll">
          {creating ? (
            <div className="rod-classes">
              {CLASSES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={pick === c.id}
                  className={`rod-class${pick === c.id ? ' is-on' : ''}`}
                  onClick={() => onPick(c.id)}
                >
                  <div className="rod-class__art" style={{ backgroundImage: `url('${c.portrait}')` }} />
                  <div className="rod-class__name">
                    <strong>{c.name}</strong>
                    <em>{c.archetype}</em>
                  </div>
                </button>
              ))}
              {LOCKED_CLASSES.map((c) => (
                <div key={c.name} className="rod-class rod-class--locked" aria-disabled="true">
                  <div className="rod-class__art rod-class__art--locked" />
                  <span className="rod-class__lock" aria-hidden="true">
                    🔒
                  </span>
                  <div className="rod-class__name">
                    <strong>{c.name}</strong>
                    <em>{c.role}</em>
                  </div>
                </div>
              ))}
            </div>
          ) : avatars.length === 0 ? (
            <div className="rod-empty">Chưa có nhân vật nào được lưu. Chọn «Tạo nhân vật» để rèn một vị.</div>
          ) : (
            <div className="rod-classes">
              {avatars.map((row) => {
                const kit = classOf(row.character);
                const on = row.id === avatarId;
                return (
                  <div key={row.id} className="rod-class-wrap">
                    <button
                      type="button"
                      aria-pressed={on}
                      className={`rod-class${on ? ' is-on' : ''}`}
                      onClick={() => onAvatar(row)}
                    >
                      <div className="rod-class__art" style={{ backgroundImage: `url('${kit.portrait}')` }} />
                      <div className="rod-class__name">
                        <strong>{row.name}</strong>
                        <em>
                          {kit.archetype} · Lv {row.level}
                        </em>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="rod-class__del"
                      aria-label={`Xóa ${row.name}`}
                      title="Xóa nhân vật"
                      disabled={busy}
                      onClick={() => onDeleteAvatar(row)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rod-select__stage rod-frame">
        <div className="rod-stage__art" style={{ backgroundImage: `url('${entry.portrait}')` }} />
        <div className="rod-stage__shade" aria-hidden="true" />

        <div className="rod-stage__title">{creating ? entry.name : selectedAvatar?.name ?? entry.name}</div>
        <div className="rod-stage__tag">
          {entry.archetype}
          <span className="rod-stage__tag-dot">•</span>
          {entry.sect}
        </div>

        {creating ? (
          <div className="rod-stage__bottom">
            <div className="rod-note">{entry.blurb}</div>
            <div className="rod-field">
              <span className="rod-label">Giới tính</span>
              <div className="rod-seg">
                <OrnateButton size="sm" on={gender === 'male'} onClick={() => onGender('male')}>
                  Nam
                </OrnateButton>
                <OrnateButton size="sm" on={gender === 'female'} onClick={() => onGender('female')}>
                  Nữ
                </OrnateButton>
              </div>
            </div>
            <label className="rod-field">
              <span className="rod-label">Đạo hiệu</span>
              <input
                className="rod-input"
                value={name}
                onChange={(event) => onName(event.target.value)}
                placeholder="Nhập đạo hiệu"
                maxLength={16}
                autoComplete="nickname"
              />
            </label>
            <OrnateButton size="lg" onClick={onForge} disabled={busy || name.trim().length === 0}>
              {busy ? 'Đang tạo…' : 'Tạo nhân vật'}
            </OrnateButton>
          </div>
        ) : (
          <div className="rod-stage__bottom">
            <div className="rod-note">
              {selectedAvatar
                ? 'Bấm vào một nhân vật khác trong danh sách để đổi, hoặc tiếp tục sang chọn phòng.'
                : 'Chọn một nhân vật trong danh sách bên trái.'}
            </div>
          </div>
        )}
      </section>

      <section className="rod-select__info rod-frame">
        <div className="rod-info__tabs">
          <button type="button" className={tab === 'info' ? 'is-on' : ''} onClick={() => setTab('info')}>
            Thông Tin
          </button>
          <button type="button" className={tab === 'skills' ? 'is-on' : ''} onClick={() => setTab('skills')}>
            Kỹ Năng
          </button>
        </div>

        <div className="rod-info__scroll">
          <div className="rod-info__head">
            <span className="rod-info__crest" aria-hidden="true" />
            <div>
              <div className="rod-info__name">{entry.name}</div>
              <div className="rod-info__sub">
                {entry.archetype} · {entry.sect}
              </div>
            </div>
          </div>

          {tab === 'info' ? (
            <>
              <p className="rod-info__blurb">{entry.blurb}</p>

              <div className="rod-info__section-title">Thuộc Tính Cơ Bản</div>
              <div className="rod-bars">
                {RATING_LABELS.map(({ key, label }) => (
                  <div key={key} className="rod-bar">
                    <span className="rod-bar__label">{label}</span>
                    <span className="rod-bar__track">
                      <span className="rod-bar__fill" style={{ width: `${(entry.ratings[key] / 5) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>

              <div className="rod-info__section-title">Kỹ Năng Đặc Biệt</div>
              <div className="rod-skill-row">
                {entry.skills.map((skill) => (
                  <div key={skill} className="rod-skill-badge" title={skill}>
                    <span className="rod-skill-badge__dot" aria-hidden="true" />
                    <span className="rod-skill-badge__label">{skill}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rod-skill-list">
              {entry.skills.map((skill, i) => (
                <div key={skill} className="rod-skill-row-item">
                  <span className="rod-skill-row-item__tier">{SKILL_TIERS[i] ?? ''}</span>
                  <span className="rod-skill-row-item__name">{skill}</span>
                </div>
              ))}
            </div>
          )}

          {!creating && selectedAvatar ? (
            <div className="rod-info__section-title">
              {CHARACTER_NAME[selectedAvatar.character]} · Luyện Khí {selectedAvatar.level}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
