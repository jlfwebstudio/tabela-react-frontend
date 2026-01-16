// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
// eslint-disable-next-line no-unused-vars
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  // CORREÇÃO AQUI: tableHeaders com os nomes EXATOS que o backend enviará após o mapeamento
  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço', // Com acento
    'Status',
    'Data Limite', // Com acento
    'Cliente',
    'CNPJ / CPF', // Com espaços e barra
    'Cidade',
    'Técnico', // Com acento
    'Prestador',
    'Justificativa do Abono', // Com acento
  ], []);

  // CORREÇÃO AQUI: allowedStatuses normalizados para comparação robusta
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ].map(s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()), []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // CORREÇÃO AQUI: normalizeStatusValue para lidar com valores undefined/null
  const normalizeStatusValue = useCallback((status) => {
    if (status === undefined || status === null) return ''; // Retorna string vazia para undefined/null
    const normalized = normalizeForComparison(status);
    // As normalizações específicas abaixo são menos críticas se allowedStatuses já está normalizado
    // e a comparação é feita com normalizeForComparison.
    // Mantido para consistência, mas o filtro principal usará allowedStatuses.includes(normalizeForComparison(status))
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString;
  }, []);

  // Função para formatar CNPJ/CPF
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  }, []);

  // Efeito para calcular o contador de OSs em atraso
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);
          return dataLimite < today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para contador:", dataLimiteStr, e);
      }
      return false;
    }).length;

    setOverdueCount(count);
  }, [filteredData]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
        !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para lidar com o upload do arquivo CSV
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setOverdueCount(0);
    setActiveFilters({});
    setFilterSelections({});
    setOpenDropdown(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const rawData = response.data;

      // CORREÇÃO AQUI: Aplicar filtro de status permitidos IMEDIATAMENTE após receber os dados
      const processedData = rawData.filter(row => {
        const status = normalizeForComparison(row['Status'] || ''); // Usar normalizeForComparison
        return allowedStatuses.includes(status);
      });

      setData(processedData);
      setFilteredData(processedData); // Inicialmente, filteredData é igual a data
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
      event.target.value = null; // Limpa o input para permitir upload do mesmo arquivo novamente
    }
  };

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    filteredData.forEach(row => {
      const value = row[columnName];
      // CORREÇÃO AQUI: Filtrar status indesejados também no dropdown
      if (columnName === 'Status') {
        const normalizedStatus = normalizeForComparison(value || '');
        if (!allowedStatuses.includes(normalizedStatus)) {
          return; // Ignora status não permitidos no dropdown
        }
      }
      values.add(value === undefined || value === null || value === '' ? '' : String(value).trim());
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return -1; // Vazio primeiro
      if (b === '') return 1;
      return String(a).localeCompare(String(b));
    });
    return sortedValues;
  }, [filteredData, allowedStatuses, normalizeForComparison]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header, event) => {
    event.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Calcula a posição do dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
      // Inicializa as seleções do dropdown com base nos filtros ativos para aquela coluna
      const currentActiveSelections = activeFilters[header] || {};
      const uniqueValues = getUniqueColumnValues(header);
      const newSelections = {};
      uniqueValues.forEach(value => {
        newSelections[value] = currentActiveSelections[value] !== undefined ? currentActiveSelections[value] : true;
      });
      setFilterSelections(newSelections);
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  // Função para lidar com a seleção de filtros
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback((header) => {
    const selectedValues = Object.keys(filterSelections).filter(Boolean);
    setActiveFilters(prev => ({
      ...prev,
      [header]: selectedValues.reduce((acc, val) => ({ ...acc, [val]: true }), {})
    }));
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setFilterSelections({}); // Limpa as seleções do dropdown
    setOpenDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Função para selecionar/desmarcar todos os filtros
  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para aplicar os filtros ativos (agora só de coluna, status já filtrado no upload)
  useEffect(() => {
    let currentFilteredData = [...data]; // Começa com os dados já filtrados por status

    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(Boolean);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const rowValue = row[header] === undefined || row[header] === null || row[header] === '' ? '' : String(row[header]).trim();
          return selectedValues.includes(rowValue);
        });
      }
    });

    // Aplica a ordenação após a filtragem
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        // Lógica de ordenação para Data Limite
        if (sortConfig.key === 'Data Limite') {
          const parseDate = (dateString) => {
            if (!dateString) return new Date(0); // Retorna uma data muito antiga para valores vazios
            const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
            if (parts) {
              const [, day, month, year, hour = '00', minute = '00', second = '00'] = parts;
              return new Date(`${month}/${day}/${year} ${hour}:${minute}:${second}`);
            }
            return new Date(dateString); // Fallback
          };
          const dateA = parseDate(aValue);
          const dateB = parseDate(bValue);
          return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Lógica de ordenação padrão para outros tipos
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig]); // Removido normalizeStatusValue, allowedStatuses pois já são tratados no upload

  // Função para solicitar ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para determinar a classe CSS da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = String(row['Justificativa do Abono'] || '').trim(); // Obter o valor da justificativa

    if (!dataLimiteStr) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        const [, day, month, year] = parts;
        const dataLimite = new Date(`${month}/${day}/${year}`);
        dataLimite.setHours(0, 0, 0, 0);

        // CORREÇÃO AQUI: Lógica para "FALTA ABONAR" na linha
        // A linha fica roxa se estiver atrasada E a justificativa estiver vazia
        if (dataLimite < today && justificativa === '') {
          return 'falta-abonar'; // Esta classe será usada para a linha inteira (roxo)
        } else if (dataLimite < today) {
          return 'overdue-strong'; // Vermelho forte para atrasados (sem abono)
        } else if (dataLimite.getTime() === today.getTime()) {
          return 'due-today'; // Amarelo para hoje
        }
      }
    } catch (e) {
      console.error("Erro ao determinar classe da linha:", dataLimiteStr, e);
    }
    return '';
  }, []);

  // Função para obter o conteúdo e a classe da célula
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Lógica para "FALTA ABONAR" na célula
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = String(row['Justificativa do Abono'] || '').trim(); // Obter o valor da justificativa

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        const parts = dataLimiteStr ? dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/) : null;
        const dataLimite = parts ? new Date(`${parts[2]}/${parts[1]}/${parts[3]}`) : null;
        if (dataLimite) dataLimite.setHours(0, 0, 0, 0);

        // Se a data estiver atrasada E a justificativa estiver vazia, exibe "FALTA ABONAR" e aplica a classe
        if (dataLimite && dataLimite < today && justificativa === '') {
          content = 'FALTA ABONAR';
          className = 'falta-abonar'; // Aplica a classe para a célula
        }
      } catch (e) {
        console.error("Erro ao verificar justificativa para 'FALTA ABONAR':", dataLimiteStr, e);
      }
    }

    // Adiciona classes de largura de coluna
    if (header === 'Numero Referencia') className += ' col-numero-referencia';
    if (header === 'CNPJ / CPF') className += ' col-cnpj-cpf';
    if (header === 'Cidade') className += ' col-cidade';
    if (header === 'Serviço') className += ' col-servico';
    if (header === 'Técnico') className += ' col-tecnico';
    if (header === 'Justificativa do Abono') className += ' col-justificativa';

    return { content, className: className.trim() };
  }, [formatDataLimite, formatCnpjCpf]);

  // Função genérica para exportar dados para Excel
  const exportDataToExcel = useCallback((dataToExport, filename) => {
    if (dataToExport.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet([]); // Cria uma planilha vazia

    // Adiciona cabeçalhos
    const headerRow = tableHeaders.map(header => ({ v: header, t: 's', s: { font: { bold: true }, fill: { fgColor: { rgb: "FFD9D9D9" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } }));
    XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

    // Adiciona dados e aplica estilos
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dataToExport.forEach((row, rowIndex) => {
      const excelRow = [];
      let rowBgColor = null;
      let rowTextColor = null;

      // Determina a cor de fundo da linha
      const dataLimiteStr = row['Data Limite'];
      const justificativa = String(row['Justificativa do Abono'] || '').trim(); // Obter a justificativa

      if (dataLimiteStr) {
        try {
          const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const dataLimite = new Date(`${month}/${day}/${year}`);
            dataLimite.setHours(0, 0, 0, 0);

            // Lógica de cor da linha para Excel
            if (dataLimite < today && justificativa === '') {
              rowBgColor = "FF800080"; // Roxo para "FALTA ABONAR"
              rowTextColor = "FFFFFFFF"; // Texto branco
            } else if (dataLimite < today) {
              rowBgColor = "FFFF0000"; // Vermelho forte para atrasados
              rowTextColor = "FFFFFFFF"; // Texto branco
            } else if (dataLimite.getTime() === today.getTime()) {
              rowBgColor = "FFFFFF00"; // Amarelo para hoje
              rowTextColor = "FF000000"; // Texto preto
            }
          }
        } catch (e) {
          console.error("Erro ao determinar cor da linha para Excel:", dataLimiteStr, e);
        }
      }

      tableHeaders.forEach(header => {
        const { content, className } = getCellContentAndClassName(row, header);
        let cellStyle = {
          border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } },
          alignment: { vertical: "center" }
        };

        // Aplica cor de fundo da linha, se houver
        if (rowBgColor) {
          cellStyle.fill = { fgColor: { rgb: rowBgColor } };
          cellStyle.font = { color: { rgb: rowTextColor }, bold: false };
        }

        // Aplica estilo para "FALTA ABONAR" (prioridade sobre a cor da linha)
        if (className.includes('falta-abonar')) {
          cellStyle.fill = { fgColor: { rgb: "FF800080" } }; // Roxo
          cellStyle.font = { color: { rgb: "FFFFFFFF" }, bold: true }; // Texto branco e negrito
        }

        excelRow.push({ v: content, t: 's', s: cellStyle });
      });
      XLSX.utils.sheet_add_aoa(ws, [excelRow], { origin: -1 }); // Adiciona a linha na próxima posição
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Chamado') width = 15;
      if (header === 'Numero Referencia') width = 20;
      if (header === 'Contratante') width = 25;
      if (header === 'Serviço') width = 30;
      if (header === 'Status') width = 20;
      if (header === 'Data Limite') width = 20;
      if (header === 'Cliente') width = 30;
      if (header === 'CNPJ / CPF') width = 25;
      if (header === 'Cidade') width = 20;
      if (header === 'Técnico') width = 30;
      if (header === 'Prestador') width = 25;
      if (header === 'Justificativa do Abono') width = 40;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
  }, [tableHeaders, getCellContentAndClassName]);

  // Função para exportar apenas as pendências do dia
  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);

          // Inclui se a data limite é menor ou igual à data de hoje
          return dataLimite <= today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para exportação de pendências:", dataLimiteStr, e);
      }
      return false;
    });

    if (pendingData.length === 0) {
      alert('Nenhum registro encontrado que atenda ao critério de “pendências do dia” (itens com data de limite vencida ou com vencimento para a data atual).');
      return;
    }

    exportDataToExcel(pendingData, 'pendencias_do_dia.xlsx');
  }, [filteredData, exportDataToExcel]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-buttons">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName ? selectedFileName : 'Carregar CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {data.length > 0 && (
            <>
              <button onClick={() => exportDataToExcel(filteredData, 'tabela_completa.xlsx')} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
              </button>
              <button onClick={handleExportPendingToExcel} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
              </button>
            </>
          )}
          {overdueCount > 0 && (
            <div className="overdue-count">
              OSs em Atraso: {overdueCount}
            </div>
          )}
        </div>
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container" translate="no">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span className="sortable-header" onClick={() => requestSort(header)}>
                        {header}
                        {sortConfig.key === header && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
                        ref={el => filterIconRefs.current[header] = el}
                      />
                    </div>

                    {openDropdown === header && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {getUniqueColumnValues(header).map(value => (
                            <label key={value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={filterSelections[value] || false}
                                onChange={() => handleFilterSelectionChange(value)}
                              />
                              {value === '' ? '(Vazio)' : value}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => toggleSelectAll(header, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header, false)}>Desmarcar Tudo</button>
                          <button onClick={() => applyFilters(header)}>Aplicar</button>
                          <button onClick={() => clearFilters(header)}>Limpar</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => ( // Usando filteredData aqui
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
